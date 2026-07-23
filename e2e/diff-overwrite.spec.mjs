import { test, expect } from './fixtures.mjs'

// Build a two-sided comparison without a native dialog (paste-compare), then
// return to files mode where the file slots are live.
async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()
}

// Make "Open file" deterministic: replace the native file dialog handler with
// one that returns a fixed file, so clicking a slot exercises the real
// renderer -> IPC -> store.pick path without an un-driveable OS dialog.
async function stubOpenFile(app, name) {
  await app.evaluate(({ ipcMain }, fileName) => {
    ipcMain.removeHandler('file:open')
    ipcMain.handle('file:open', (_e, side) => ({
      path: `/virtual/${side}-${fileName}`,
      name: fileName,
      content: `content of ${fileName}`
    }))
  }, name)
}

// Opening a file into a loaded, UNSAVED comparison must warn before discarding
// it — the same protection drag-drop already has, now on the Open/slot path.
test('opening a file over an unsaved comparison warns first, and can replace', async ({
  app,
  page
}) => {
  await pasteCompare(page, 'left body', 'right body')
  await stubOpenFile(app, 'picked.txt')

  // Click the left file slot -> store.pick('left') -> the guard fires.
  await page.locator('.slot[data-side="left"]').click()

  const dialog = page.getByRole('dialog', { name: 'Replace current comparison?' })
  await expect(dialog).toBeVisible()
  // Nothing replaced while the prompt is up.
  await expect(page.locator('.slot[data-side="left"] .name')).toHaveText('Left (pasted)')

  await dialog.getByRole('button', { name: 'Replace anyway' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.slot[data-side="left"] .name')).toHaveText('picked.txt')
})

// Cancelling the prompt leaves the current comparison exactly as it was.
test('cancelling the overwrite prompt keeps the current comparison', async ({ app, page }) => {
  await pasteCompare(page, 'left body', 'right body')
  await stubOpenFile(app, 'other.txt')

  await page.locator('.slot[data-side="right"]').click()
  const dialog = page.getByRole('dialog', { name: 'Replace current comparison?' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.slot[data-side="right"] .name')).toHaveText('Right (pasted)')
})
