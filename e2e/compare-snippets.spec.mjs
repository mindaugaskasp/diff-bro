import { test, expect, openNewSnippet, showPanel } from './fixtures.mjs'

test.beforeEach(async ({ page }) => {
  await showPanel(page, 'snippets')
})

// Dragging is only real in a launched app: the payload rides a DataTransfer the
// browser owns, the drop is a window-level handler, and the content comes back
// through vault:decrypt over IPC. jsdom has none of the three.

const DIAGRAM = 'Example — Mermaid diagram'
const PROMPT = 'Example — Claude review prompt'

// Playwright's dragTo does not carry a custom DataTransfer type between two
// elements reliably, so the drag is driven the way the browser does it: one
// DataTransfer shared by dragstart and drop.
async function dragRowTo(page, name, targetSelector) {
  await page.locator('.snippets-section .row', { hasText: name }).hover()
  await page.evaluate(
    ({ name: rowName, target }) => {
      const row = [...document.querySelectorAll('.snippets-section .row')].find((r) =>
        r.textContent.includes(rowName)
      )
      const dt = new DataTransfer()
      row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
      const drop = document.querySelector(target)
      drop.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
      drop.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
    },
    { name, target: targetSelector }
  )
}

test('two dropped snippets open as an ordinary comparison', async ({ page }) => {
  await dragRowTo(page, DIAGRAM, '.slot[data-side="left"]')
  await expect(page.locator('.slot[data-side="left"]')).toContainText(DIAGRAM, { timeout: 15000 })
  // One snippet fills a side and waits, exactly as one file does.
  await expect(page.locator('.monaco-diff-editor')).toHaveCount(0)

  await dragRowTo(page, PROMPT, '.slot[data-side="right"]')
  await expect(page.locator('.slot[data-side="right"]')).toContainText(PROMPT, { timeout: 15000 })
  await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 15000 })
})

// The point of the link: a pasted copy would go stale the moment the snippet
// moved on. Plaintext on purpose — a snippet with a preview (claude, mermaid)
// renders no raw editor to type into.
test('editing a compared snippet updates the diff without a reload', async ({ app, page }) => {
  await openNewSnippet(page)
  const make = page.getByRole('dialog', { name: 'New Snippet' })
  await make.getByPlaceholder('Snippet name…').fill('Live target')
  // Typed rather than pasted: routing this through the OS clipboard sometimes
  // did not land under CI's parallel workers, leaving the editor empty and Save
  // disabled until the test timed out. The clipboard is not what this covers.
  await make.locator('.editor').click()
  await page.keyboard.type('before-the-edit')
  const save = make.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeEnabled()
  await save.click()
  await page.keyboard.press('Escape')

  await dragRowTo(page, 'Live target', '.slot[data-side="left"]')
  await expect(page.locator('.slot[data-side="left"]')).toContainText('Live target', {
    timeout: 15000
  })
  await dragRowTo(page, DIAGRAM, '.slot[data-side="right"]')
  await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 15000 })

  await page.locator('.snippets-section .row', { hasText: 'Live target' }).click()
  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await view.getByRole('button', { name: 'Edit', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit Snippet' })
  await edit.locator('.editor').click()
  await page.keyboard.press('ControlOrMeta+a')
  await app.evaluate(({ clipboard }) => clipboard.writeText('LIVE-EDIT-MARKER'))
  await app.evaluate(({ BrowserWindow }) =>
    (BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]).webContents.paste()
  )
  await edit.getByRole('button', { name: 'Save', exact: true }).click()
  await page.keyboard.press('Escape')

  await expect(page.locator('.diff-container')).toContainText('LIVE-EDIT-MARKER', {
    timeout: 15000
  })
})

// Clearing or saving is the diff's business; the library is not touched.
test('clearing the comparison leaves both snippets alone', async ({ page }) => {
  const rows = () => page.locator('.snippets-section .row')
  const before = await rows().count()

  await dragRowTo(page, DIAGRAM, '.slot[data-side="left"]')
  await expect(page.locator('.slot[data-side="left"]')).toContainText(DIAGRAM, { timeout: 15000 })
  await page.getByRole('button', { name: 'Clear', exact: true }).click()

  await expect(rows()).toHaveCount(before)
  await expect(rows().filter({ hasText: DIAGRAM })).toHaveCount(1)
})

test('a secret snippet is not draggable', async ({ page }) => {
  await openNewSnippet(page)
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Prod API key')
  await editor.locator('.editor').click()
  await page.keyboard.type('sk-live-DEADBEEF')
  await editor.locator('.secret-toggle input[type="checkbox"]').check()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await page.keyboard.press('Escape')

  const secret = page.locator('.snippets-section .row', { hasText: 'Prod API key' })
  await expect(secret).toHaveAttribute('draggable', 'false')
  const ordinary = page.locator('.snippets-section .row', { hasText: DIAGRAM })
  await expect(ordinary).toHaveAttribute('draggable', 'true')
})

const paneOrder = (waiting) =>
  waiting.evaluate((el) =>
    [...el.children].map((s) => (s.classList.contains('loaded') ? 'loaded' : 'open'))
  )

test('one side loaded shows its contents and an empty pane, in pane order', async ({ page }) => {
  const row = page.locator('.row', { hasText: DIAGRAM }).first()
  const rb = await row.boundingBox()
  const pb = await page.locator('.pane').boundingBox()
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2)
  await page.mouse.down()
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2, { steps: 10 })
  await page.mouse.up()

  const waiting = page.locator('.waiting')
  await expect(waiting).toBeVisible()
  expect(await paneOrder(waiting)).toEqual(['loaded', 'open'])
  await expect(waiting.locator('.wait-pane.loaded .monaco-editor')).toBeVisible()
  // Accent on the rim, never the label: as ink it fails contrast on solar, meridian, sepia.
  const open = waiting.locator('.wait-slot.open')
  expect(await open.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('dashed')
  await expect(open.locator('.wait-label')).toContainText('Right')

  expect(await open.evaluate((el) => el.tagName)).toBe('BUTTON')
  expect(await open.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer')
  await expect(open).toHaveAttribute('aria-label', /Choose the Right file/)
})

test('the empty pane sits on the left when the LEFT side is missing', async ({ page }) => {
  const row = page.locator('.row', { hasText: DIAGRAM }).first()
  const rb = await row.boundingBox()
  const right = await page.locator('[data-side="right"]').first().boundingBox()
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2)
  await page.mouse.down()
  await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2, { steps: 10 })
  await page.mouse.up()

  const waiting = page.locator('.waiting')
  await expect(waiting).toBeVisible()
  await expect(waiting.locator('.wait-label')).toContainText('Left')
  expect(await paneOrder(waiting)).toEqual(['open', 'loaded'])
})

// The hover preview is anchored to the row you start the drag from, so it sat
// directly over the area being dragged TO. Nothing else closed it: the pointer
// never leaves the row before the drag takes over.
test('the hover preview gets out of the way once a drag starts', async ({ page }) => {
  const row = page.locator('.row', { hasText: DIAGRAM }).first()
  const anchor = row.locator('[data-preview-anchor]').first()
  await ((await anchor.count()) ? anchor : row).hover()
  await expect(page.locator('.preview')).toBeVisible({ timeout: 5000 })

  // dragstart with the pointer STILL on the row: no hover-out fires, so the
  // @dragging wiring is the only thing that can close the card. Moving the
  // mouse away first made this pass with the feature deleted.
  await row.dispatchEvent('dragstart')
  await expect(page.locator('.preview')).toHaveCount(0, { timeout: 1000 })
  expect(await row.evaluate((el) => el.matches(':hover'))).toBe(true)
})

// The card said what would happen; nothing said WHERE. The pane draws the
// landing area itself while a row is over it — measured, because "is the drop
// zone visible" is a rendered property, not a state flag.
test('the pane marks the area a dragged snippet would land in', async ({ page }) => {
  const row = page.locator('.snippets-section .row[draggable="true"]').first()
  await row.waitFor()
  await expect(page.locator('.drop-overlay.in-pane')).toHaveCount(0)

  await page.evaluate(() => {
    const src = document.querySelector('.snippets-section .row[draggable="true"]')
    const dt = new DataTransfer()
    src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
    const pane = document.querySelector('.pane')
    pane.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
    pane.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }))
  })

  const overlay = page.locator('.drop-overlay.in-pane')
  await expect(overlay).toBeVisible()
  const rim = await overlay.evaluate((el) => {
    const s = getComputedStyle(el, '::before')
    return { style: s.borderStyle, width: s.borderTopWidth }
  })
  expect(rim.style).toBe('dashed')
  expect(Number.parseFloat(rim.width)).toBeGreaterThanOrEqual(2)
})
