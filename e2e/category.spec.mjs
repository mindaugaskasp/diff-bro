import { test, expect } from './fixtures.mjs'

// Creating a category on the fly from the Save dialog is a UI seam the store
// tests can't reach: the "+ New category…" option reveals a name field, and on
// save the diff must file into a freshly created, auto-expanded shelf in the
// sidebar. Uses paste-compare to make something saveable without a file dialog.
test('saving into a new category creates its shelf and files the diff there', async ({ page }) => {
  const CATEGORY = 'E2E work items'
  const DIFF = 'Categorised diff'

  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('a')
  await page.getByPlaceholder('Paste changed text here').fill('b')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill(DIFF)

  // Choosing "+ New category…" (value __new__) reveals the name field; fill it,
  // then save. Selected by value — the option label carries an ellipsis, and the
  // wrapping <label> is non-exact because the <select>'s option text is part of
  // its accessible name.
  await dialog.getByLabel('Category').selectOption('__new__')
  await dialog.getByLabel('New category name').fill(CATEGORY)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()

  // The new shelf appears (auto-expanded) with the diff filed under it.
  await expect(page.getByText('Saved (encrypted)')).toBeVisible()
  await expect(page.locator('.cat-name', { hasText: CATEGORY })).toBeVisible()
  await expect(page.getByText(DIFF)).toBeVisible()
})
