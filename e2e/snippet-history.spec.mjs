import {
  test,
  expect,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  openNewSnippet,
  showPanel,
  snippetDoc,
  editInPlace,
  closeSnippet,
  docActions
} from './fixtures.mjs'
import { rmSync } from 'node:fs'
import { focusEditor } from './monaco.mjs'

// Version history is real only in a launched app: versions are the actual
// encrypted boxes riding the vault key IPC, and the diff pane is Monaco —
// jsdom has neither. The store arithmetic is unit-tested; this drives the
// user path: edit twice, open History, read the change.

async function createSnippet(page, name, body, { secret = false } = {}) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await focusEditor(editor)
  await page.keyboard.type(body)
  if (secret) await editor.locator('.secret-toggle input[type="checkbox"]').check()
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()
}

async function editSnippet(page, name, body) {
  await page.locator('.snippets-section .row', { hasText: name }).first().click()
  const view = snippetDoc(page)
  // A secret opens masked, and a masked one is not edited: reveal first.
  const show = docActions(page).getByRole('button', { name: 'Show', exact: true })
  if (await show.isVisible().catch(() => false)) await show.click()
  await editInPlace(page)
  await focusEditor(view)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(body)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()
}

async function openHistory(page, name) {
  await page.locator('.snippets-section .row', { hasText: name }).first().click()
  const view = page.getByRole('region', { name: 'Snippet', exact: true })
  await docActions(page).getByRole('button', { name: 'History', exact: true }).click()
  // Docked beside the snippet, which stays open.
  await expect(view).toBeVisible()
  return page.getByRole('complementary', { name: /^History — / })
}

test('two edits become two versions, each diffed against its predecessor', async ({
  app,
  page
}) => {
  await createSnippet(page, 'Rollout plan', 'replicas: 1')
  // A snippet with no history yet offers no History button.
  await page.locator('.snippets-section .row', { hasText: 'Rollout plan' }).first().click()
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()
  await expect(docActions(page).getByRole('button', { name: 'History', exact: true })).toHaveCount(
    0
  )
  // The ghost Close by its text — the header × carries the same accessible name.
  await closeSnippet(page)

  await editSnippet(page, 'Rollout plan', 'replicas: 3')
  await editSnippet(page, 'Rollout plan', 'replicas: 5')

  const dialog = await openHistory(page, 'Rollout plan')
  await expect(dialog).toBeVisible()
  const versions = dialog.locator('.hist-version')
  await expect(versions).toHaveCount(3)
  await expect(versions.first()).toContainText('Current')

  // The current row's diff: previous content on the removed side, current on
  // the added side, rendered by a real Monaco inline diff.
  await expect(dialog.locator('.hist-diff .view-line').first()).toBeVisible()
  await expect(dialog.locator('.hist-diff')).toContainText('replicas: 5')

  // Selecting the oldest version shows what the snippet started as.
  await versions.last().click()
  await expect(dialog.locator('.hist-diff')).toContainText('replicas: 1')

  // Copy hands the selected version's text to the real clipboard.
  await app.evaluate(({ clipboard }) => clipboard.clear())
  await dialog.getByRole('button', { name: 'Copy this version' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('replicas: 1')
})

test('a name-only edit adds no version', async ({ page }) => {
  await createSnippet(page, 'Endpoint note', 'GET /v1/users')
  await editSnippet(page, 'Endpoint note', 'GET /v2/users')

  // Rename without touching the content: no new version may appear. The
  // un-named handle again — the document re-titles itself on Edit.
  await page.locator('.snippets-section .row', { hasText: 'Endpoint note' }).first().click()
  const view = snippetDoc(page)
  await editInPlace(page)
  await view.getByPlaceholder('Snippet name…').fill('Endpoint note v2')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()

  const dialog = await openHistory(page, 'Endpoint note v2')
  await expect(dialog.locator('.hist-version')).toHaveCount(2)
})

test("a secret snippet's history opens masked, copies masked, reveals on demand", async ({
  app,
  page
}) => {
  await createSnippet(page, 'Prod token', 'sk-live-OLD', { secret: true })
  await editSnippet(page, 'Prod token', 'sk-live-NEW')

  const dialog = await openHistory(page, 'Prod token')
  await expect(dialog.locator('.secret-mask')).toBeVisible()
  await expect(dialog.locator('.hist-diff .view-line')).toHaveCount(0)

  // Copy without revealing — the point of a secret; the plaintext reaches the
  // clipboard while the DOM keeps the mask. Current has no copy here: it is the
  // snippet itself, so the older version is the one to copy.
  await dialog.locator('.hist-version').last().click()
  await app.evaluate(({ clipboard }) => clipboard.clear())
  await dialog.getByRole('button', { name: 'Copy this version' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('sk-live-OLD')
  await expect(dialog.locator('.secret-mask')).toBeVisible()

  await dialog.getByRole('button', { name: 'Show', exact: true }).click()
  await expect(dialog.locator('.secret-mask')).toHaveCount(0)
  await expect(dialog.locator('.hist-diff')).toContainText('sk-live-OLD')
})

const LONG = `curl -fsS -o /dev/null -w "%{http_code}\\n" https://example.com/health/${'x'.repeat(160)}`

test('the history diff wraps a long line instead of scrolling sideways', async ({ page }) => {
  await createSnippet(page, 'Wrapped', LONG)
  await editSnippet(page, 'Wrapped', `${LONG} ggg`)
  const panel = await openHistory(page, 'Wrapped')
  await expect(panel.locator('.hist-diff .view-line').first()).toBeVisible()

  const overflow = await page.evaluate(() => {
    const pane = document.querySelector('.hist-diff').getBoundingClientRect()
    // What is on screen: the modified side's lines and the removed lines drawn as
    // view zones. Inline mode keeps the original editor alive but hidden.
    const lines = [
      ...document.querySelectorAll(
        '.hist-diff .editor.modified .view-lines .view-line span, .hist-diff .view-zones .view-line span'
      )
    ]
    return Math.max(...lines.map((l) => l.getBoundingClientRect().right)) - pane.right
  })
  expect(overflow).toBeLessThanOrEqual(1)
})

test('the copy action sits on the selected version, not in a footer', async ({ page }) => {
  await createSnippet(page, 'Banded', 'v1')
  await editSnippet(page, 'Banded', 'v2')
  const panel = await openHistory(page, 'Banded')
  const band = panel.locator('.hist-band')

  await expect(band).toContainText('This is the current version')
  // The selected pair's line counts, from Monaco's own diff of what is on screen.
  await expect(band.locator('.hb-stats .add')).toHaveText('+1')
  await expect(band.locator('.hb-stats .del')).toHaveText('−1')
  await expect(panel.getByRole('button', { name: 'Copy this version' })).toHaveCount(0)

  await panel.locator('.hist-version').last().click()
  await expect(band).toContainText('→ Current')
  await expect(band.getByRole('button', { name: 'Copy this version' })).toBeVisible()
  await expect(panel.locator('.hist-version').last()).toHaveAttribute('aria-current', 'true')
})

test('the panel resizes from its left edge, and a double-click resets it', async ({ page }) => {
  await createSnippet(page, 'Resizable', 'a')
  await editSnippet(page, 'Resizable', 'b')
  const panel = await openHistory(page, 'Resizable')
  const width = async () => (await panel.boundingBox()).width
  const before = await width()

  const grip = await panel.locator('.hist-grip').boundingBox()
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x - 120, grip.y + grip.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(await width()).toBeGreaterThan(before + 100)

  await panel.locator('.hist-grip').dblclick()
  expect(Math.round(await width())).toBe(Math.round(before))
})

test('the panel keeps its width across a relaunch', async () => {
  const dir = freshUserDataDir()
  try {
    const first = await launchApp(dir)
    let page = await firstReadyPage(first)
    await createSnippet(page, 'Remembered', 'a')
    await editSnippet(page, 'Remembered', 'b')
    let panel = await openHistory(page, 'Remembered')
    const grip = await panel.locator('.hist-grip').boundingBox()
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x - 120, grip.y + grip.height / 2, { steps: 6 })
    await page.mouse.up()
    const widened = Math.round((await panel.boundingBox()).width)
    await first.close()

    const second = await launchApp(dir)
    page = await firstReadyPage(second)
    await showPanel(page, 'snippets')
    panel = await openHistory(page, 'Remembered')
    expect(Math.round((await panel.boundingBox()).width)).toBe(widened)
    await second.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
