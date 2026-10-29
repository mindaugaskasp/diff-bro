import { test, expect, showPanel, openNewSnippet } from './fixtures.mjs'

async function openSnippet(page) {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
  const doc = page.locator('.snippet-doc:visible')
  await expect(doc.locator('.editor')).toBeVisible()
  return doc
}

test('tags sit in a row with no frame, and + Add tag starts editing', async ({ page }) => {
  const doc = await openSnippet(page)
  await expect(doc.locator('.tagfield')).toHaveCount(0)
  await expect(doc.locator('.tag-row .tag-chip')).toHaveCount(3)

  await doc.getByRole('button', { name: 'Add tag' }).click()
  await expect(page.getByRole('region', { name: 'Edit snippet' })).toBeVisible()
  await expect(doc.getByPlaceholder('add a tag…')).toBeFocused()
})

test('suggestions open over the editor without moving it', async ({ page }) => {
  const doc = await openSnippet(page)
  await doc.getByRole('button', { name: 'Add tag' }).click()
  const editorTop = async () => (await doc.locator('.editor-area').boundingBox()).y
  await doc.getByPlaceholder('add a tag…').blur()
  const before = await editorTop()

  await doc.getByPlaceholder('add a tag…').focus()
  const pop = doc.locator('.tag-pop')
  await expect(pop).toBeVisible()
  await expect(pop).toContainText('3 of 20')
  expect(await editorTop()).toBe(before)
})

// Its own untagged snippet: beside the seeded three, a fourth chip may fold into +N.
test('Enter adds a chip and × removes it', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('add a tag…').fill('freshtag')
  await doc.getByPlaceholder('add a tag…').press('Enter')
  await expect(doc.locator('.tag-row .tag-chip', { hasText: 'freshtag' })).toBeVisible()
  await doc.getByRole('button', { name: /Remove tag freshtag/i }).click()
  await expect(doc.locator('.tag-row .tag-chip', { hasText: 'freshtag' })).toHaveCount(0)
})
