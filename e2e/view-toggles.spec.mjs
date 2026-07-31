import { test, expect } from './fixtures.mjs'

// The toolbar toggles feed Monaco options and store state; a launch proves each
// actually changes the rendered diff, which jsdom can't show.
async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()
}

test('ignore-whitespace turns a whitespace-only diff into "No differences"', async ({ page }) => {
  await pasteCompare(page, 'alpha\nbeta', 'alpha \nbeta') // trailing space, line 1
  const identical = page.locator('.diff-viewer .identical-row')
  await expect(identical).toBeHidden() // a change, for now

  await page.getByLabel('Ignore whitespace').check()
  await expect(identical).toContainText('No differences')
})

test('the Paste text button names its destination so the toggle is explicit', async ({ page }) => {
  const toggle = page
    .locator('.toolbar .actions button')
    .filter({ hasText: /Paste text|File mode/ })
  await expect(toggle).toHaveText('Paste text') // files mode: offers paste
  await toggle.click()
  await expect(page.getByPlaceholder('Paste original text here')).toBeVisible()
  await expect(toggle).toHaveText('File mode') // now offers the way back
  await toggle.click()
  await expect(toggle).toHaveText('Paste text') // back to files mode
  await expect(page.getByPlaceholder('Paste original text here')).toBeHidden()
})

test('Swap flips additions and deletions', async ({ page }) => {
  await pasteCompare(page, 'a', 'a\nb') // right has an extra line → +1 / −0
  await expect(page.locator('.stats .add')).toHaveText('+1')
  await expect(page.locator('.stats .del')).toContainText('0')

  await page.getByRole('button', { name: 'Swap sides' }).click()
  await expect(page.locator('.stats .add')).toHaveText('+0')
  await expect(page.locator('.stats .del')).toContainText('1')
})

test('Split view toggles between side-by-side and inline', async ({ page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc')
  // Monaco tags the diff root .side-by-side only when rendering two columns.
  const sideBySide = page.locator('.monaco-diff-editor.side-by-side')
  await expect(sideBySide).toHaveCount(1)

  await page.getByLabel('Split view').uncheck()
  await expect(sideBySide).toHaveCount(0) // now inline
})
