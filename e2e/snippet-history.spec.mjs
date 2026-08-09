import { test, expect, newSnippetButton } from './fixtures.mjs'
import { focusEditor } from './monaco.mjs'

// Version history is real only in a launched app: versions are the actual
// encrypted boxes riding the vault key IPC, and the diff pane is Monaco —
// jsdom has neither. The store arithmetic is unit-tested; this drives the
// user path: edit twice, open History, read the change.

async function createSnippet(page, name, body, { secret = false } = {}) {
  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await focusEditor(editor)
  await page.keyboard.type(body)
  if (secret) await editor.locator('.secret-toggle input[type="checkbox"]').check()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function editSnippet(page, name, body) {
  await page.locator('.snippets-section .row', { hasText: name }).click()
  // The dialog re-titles itself on Edit ("Snippet" → "Edit snippet"), so a
  // name-scoped handle goes stale mid-helper; only one dialog is ever open.
  const view = page.getByRole('dialog')
  await view.getByRole('button', { name: 'Edit' }).click()
  // A secret opens masked with no editor mounted — reveal before typing.
  const show = view.getByRole('button', { name: 'Show', exact: true })
  if (await show.isVisible().catch(() => false)) await show.click()
  await focusEditor(view)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(body)
  await view.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(view).toBeHidden()
}

async function openHistory(page, name) {
  await page.locator('.snippets-section .row', { hasText: name }).click()
  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await view.getByRole('button', { name: 'History', exact: true }).click()
  // The editor gets out of the way first — never two stacked dialogs.
  await expect(view).toHaveCount(0)
  return page.getByRole('dialog', { name: /^History — / })
}

test('two edits become two versions, each diffed against its predecessor', async ({
  app,
  page
}) => {
  await createSnippet(page, 'Rollout plan', 'replicas: 1')
  // A snippet with no history yet offers no History button.
  await page.locator('.snippets-section .row', { hasText: 'Rollout plan' }).click()
  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await expect(view.getByRole('button', { name: 'Edit' })).toBeVisible()
  await expect(view.getByRole('button', { name: 'History', exact: true })).toHaveCount(0)
  // The ghost Close by its text — the header × carries the same accessible name.
  await view.getByText('Close', { exact: true }).click()

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
  // un-named handle again — the dialog re-titles itself on Edit.
  await page.locator('.snippets-section .row', { hasText: 'Endpoint note' }).click()
  const view = page.getByRole('dialog')
  await view.getByRole('button', { name: 'Edit' }).click()
  await view.getByPlaceholder('Snippet name…').fill('Endpoint note v2')
  await view.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(view).toBeHidden()

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
  // clipboard while the DOM keeps the mask.
  await app.evaluate(({ clipboard }) => clipboard.clear())
  await dialog.getByRole('button', { name: 'Copy this version' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('sk-live-NEW')
  await expect(dialog.locator('.secret-mask')).toBeVisible()

  await dialog.getByRole('button', { name: 'Show', exact: true }).click()
  await expect(dialog.locator('.secret-mask')).toHaveCount(0)
  await expect(dialog.locator('.hist-diff')).toContainText('sk-live-NEW')
})
