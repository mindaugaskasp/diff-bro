import { test, expect, showPanel } from './fixtures.mjs'

test.beforeEach(async ({ page }) => {
  await showPanel(page, 'snippets')
})

// One side loaded by mistake was a dead end: the empty slot only offers to fill
// the OTHER side, so the wrong first file could not be taken back from the very
// screen that was showing it.
//
// Dropped, not typed: a synthesized DragEvent is the only way to fill one slot
// from the renderer — Chromium will not begin a native HTML5 drag from injected
// pointer input.
async function loadOneSide(page) {
  await page.locator('.snippets-section .row[draggable="true"]').first().waitFor()
  await page.evaluate(() => {
    const row = document.querySelector('.snippets-section .row[draggable="true"]')
    const dt = new DataTransfer()
    row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
    const slot = document.querySelector('.slot[data-side="left"]')
    slot.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
    slot.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
  })
  await page.locator('.waiting').waitFor()
}

// One way to abandon a comparison: close its tab. A Clear inside the empty pane
// read as "clear this pane" and wiped the loaded side too.
test('the waiting screen offers no Clear; the loaded side stays', async ({ page }) => {
  await loadOneSide(page)
  const waiting = page.locator('.waiting')
  await expect(waiting.locator('.wait-slot.open')).toBeVisible()
  await expect(waiting.getByRole('button', { name: /clear/i })).toHaveCount(0)
})

test('neither the toolbar nor the app menu carries Clear, and Cmd+K does nothing', async ({
  app,
  page
}) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('one')
  await page.getByPlaceholder('Paste or type the changed text').fill('two')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()

  await expect(page.locator('header.toolbar').getByRole('button', { name: /^Clear/ })).toHaveCount(
    0
  )
  await page.keyboard.press('ControlOrMeta+K')
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()

  const labels = await app.evaluate(({ Menu }) => {
    const walk = (menu) =>
      menu.items.flatMap((i) => [i.label, ...(i.submenu ? walk(i.submenu) : [])])
    return walk(Menu.getApplicationMenu())
  })
  expect(labels).not.toContain('Clear')
})
