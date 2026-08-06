import { test, expect, openMenu } from './fixtures.mjs'

// The in-app menu bar (Windows/Linux) mirrors the hidden native menu that binds
// the real accelerators. Native accelerators can't be synthesized through the
// renderer, so this drives the menu bar itself — which shares the menus.js
// action table — proving each menu action reaches the store.
async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()
}

test('Edit → Clear empties a loaded comparison', async ({ page }) => {
  await pasteCompare(page, 'a', 'b')
  await openMenu(page, 'Edit', 'Clear')
  await expect(page.getByText('Choose or drop two files to compare.')).toBeVisible()
})

test('Edit → Paste Text Mode opens the paste panes', async ({ page }) => {
  await openMenu(page, 'Edit', 'Paste Text Mode')
  await expect(page.getByPlaceholder('Paste original text here')).toBeVisible()
})

test('View → Toggle Light/Dark Theme flips the ground', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await openMenu(page, 'View', 'Toggle Light/Dark Theme')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('Edit → Copy Diff as Patch reaches the clipboard', async ({ app, page }) => {
  await pasteCompare(page, 'one\ntwo', 'one\nTWO')
  await openMenu(page, 'Edit', 'Copy Diff as Patch')
  await expect(page.getByText('Unified diff copied to clipboard.')).toBeVisible()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toContain('@@')
  expect(clip).toContain('+TWO')
})
