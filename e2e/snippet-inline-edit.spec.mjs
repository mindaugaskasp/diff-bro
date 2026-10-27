import { test, expect, clickAppMenuItem, showPanel, editInPlace, docActions } from './fixtures.mjs'

async function openSnippet(page) {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
  const doc = page.locator('.snippet-doc:visible')
  await expect(doc.locator('.editor .view-lines')).toBeVisible()
  return doc
}
const actionNames = (page) =>
  docActions(page)
    .locator('button')
    .evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || b.textContent.trim()))
const editing = (page) => page.getByRole('region', { name: 'Edit Snippet' })

test('the action row is the same viewing and editing, with no Edit, Cancel, Clear or Close', async ({
  page
}) => {
  const doc = await openSnippet(page)
  const viewing = await actionNames(page)
  for (const gone of ['Edit', 'Cancel', 'Clear', 'Close']) expect(viewing).not.toContain(gone)
  expect(viewing).toContain('Save')

  await doc.locator('.editor .view-lines').click()
  await expect(editing(page)).toBeVisible()
  expect(await actionNames(page)).toEqual(viewing)
})

test('clicking the content edits it in place, and nothing moves', async ({ page }) => {
  const doc = await openSnippet(page)
  const top = async () => (await doc.locator('.editor-area').boundingBox()).y
  const before = await top()
  await doc.locator('.editor .view-line').nth(2).click()
  await expect(editing(page)).toBeVisible()
  expect(await top()).toBe(before)
  await expect(doc.locator('.editor-status')).toContainText('Ln 3,')
})

test('the content says it can be edited before it is clicked', async ({ page }) => {
  const doc = await openSnippet(page)
  await doc.locator('.editor-area').hover()
  await expect(doc.locator('.edit-cue')).toBeVisible()
})

test('Save waits for a change, then saves and returns to viewing', async ({ page }) => {
  const doc = await openSnippet(page)
  const save = docActions(page).getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeDisabled()
  await doc.locator('.editor .view-line').nth(2).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Thanks.')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()
})

test('Escape with nothing changed returns to viewing; with a change it stays', async ({ page }) => {
  const doc = await openSnippet(page)
  await doc.locator('.editor .view-line').first().click()
  await expect(editing(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()

  // The caret left by the first edit covers line 1, so press beside it.
  await editInPlace(page)
  await page.keyboard.type('x')
  await page.keyboard.press('Escape')
  await expect(editing(page)).toBeVisible()
})

test('clicking the name edits it', async ({ page }) => {
  const doc = await openSnippet(page)
  await doc.getByPlaceholder('Snippet name…').click()
  await expect(editing(page)).toBeVisible()
  await expect(doc.getByPlaceholder('Snippet name…')).toBeFocused()
})

test('File ▸ Save saves the snippet in front', async ({ app, page }) => {
  const doc = await openSnippet(page)
  await doc.locator('.editor .view-line').nth(2).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Via the menu.')
  await expect(page.locator('.diff-tabs .tab .dirty')).toHaveCount(1)
  await clickAppMenuItem(app, 'Save')
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()
  await expect(page.locator('.diff-tabs .tab .dirty')).toHaveCount(0)
  await expect(doc.locator('.editor')).toContainText('Via the menu.')
  await expect(page.getByRole('dialog', { name: 'Save diff' })).toHaveCount(0)
})
