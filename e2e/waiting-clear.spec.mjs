import { test, expect } from './fixtures.mjs'

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
  await page.locator('.wait-slots').waitFor()
}

test('the waiting screen can clear the file already loaded', async ({ page }) => {
  await loadOneSide(page)
  const waiting = page.locator('.waiting')
  await expect(waiting).toBeVisible()

  await waiting.getByRole('button', { name: 'Clear the loaded file' }).click()

  await expect(waiting).toHaveCount(0)
  await expect(page.getByText('Choose or drop two files to compare.')).toBeVisible()
})

test('the clear control is not the way to fill the empty side', async ({ page }) => {
  await loadOneSide(page)
  const waiting = page.locator('.waiting')
  // Both are on screen and they are different controls.
  await expect(waiting.locator('.wait-slot.open')).toBeVisible()
  await expect(waiting.getByRole('button', { name: 'Clear the loaded file' })).toBeVisible()
})
