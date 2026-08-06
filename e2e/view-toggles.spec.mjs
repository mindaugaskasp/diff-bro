import { test, expect, setViewOption } from './fixtures.mjs'

// The toolbar toggles feed Monaco options and store state; a launch proves each
// actually changes the rendered diff, which jsdom can't show.
async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()
}

test('ignore-whitespace turns a whitespace-only diff into "No differences"', async ({ page }) => {
  await pasteCompare(page, 'alpha\nbeta', 'alpha \nbeta') // trailing space, line 1
  const identical = page.locator('.diff-viewer .identical-row')
  await expect(identical).toBeHidden() // a change, for now

  await setViewOption(page, 'Ignore whitespace')
  await expect(identical).toContainText('No differences')
})

test('the Paste mode button names its destination so the toggle is explicit', async ({ page }) => {
  const toggle = page
    .locator('.toolbar .actions button')
    .filter({ hasText: /Paste mode|File mode/ })
  await expect(toggle).toHaveText('Paste mode') // files mode: offers paste
  await toggle.click()
  await expect(page.getByPlaceholder('Paste original text here')).toBeVisible()
  await expect(toggle).toHaveText('File mode') // now offers the way back
  await toggle.click()
  await expect(toggle).toHaveText('Paste mode') // back to files mode
  await expect(page.getByPlaceholder('Paste original text here')).toBeHidden()
})

test('Swap flips additions and deletions', async ({ page }) => {
  await pasteCompare(page, 'a', 'a\nb') // right has an extra line → +1 / −0
  await expect(page.locator('.status-band .add')).toHaveText('1 added')
  await expect(page.locator('.status-band .del')).toContainText('0 removed')

  await page.getByRole('button', { name: 'Swap sides' }).click()
  await expect(page.locator('.status-band .add')).toHaveText('0 added')
  await expect(page.locator('.status-band .del')).toContainText('1 removed')
})

test('Split view toggles between side-by-side and inline', async ({ page }) => {
  await pasteCompare(page, 'a\nb', 'a\nc')
  // Monaco tags the diff root .side-by-side only when rendering two columns.
  const sideBySide = page.locator('.monaco-diff-editor.side-by-side')
  await expect(sideBySide).toHaveCount(1)

  await setViewOption(page, 'Split view', false)
  await expect(sideBySide).toHaveCount(0) // now inline
})

// Clear wipes the paste panes too, and Ctrl/Cmd+K always could — but the button
// was gated on the FILE slots, so it greyed out over the text it would clear.
test('Clear is available over pasted text, not just loaded files', async ({ page }) => {
  const clear = page.getByRole('button', { name: 'Clear', exact: true })
  await expect(clear).toBeDisabled() // nothing anywhere yet

  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill('some pasted work')
  await expect(clear).toBeEnabled()
  await expect(clear).toHaveAttribute('data-tip', /Clear/)

  await clear.click()
  await expect(page.getByPlaceholder('Paste original text here')).toHaveValue('')
  await expect(clear).toBeDisabled()
})
