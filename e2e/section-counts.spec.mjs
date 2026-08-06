import { test, expect } from './fixtures.mjs'

// Filtering by a tag has to say WHERE the matches are. A section with none is
// the answer to "why is this empty", so it stays visible showing zero rather
// than leaving the reader to guess.
async function saveTaggedDiff(page, name, tag) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill('before')
  await page.getByPlaceholder('Paste changed text here').fill('after')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByPlaceholder('add a tag…').fill(tag)
  await dialog.getByPlaceholder('add a tag…').press('Enter')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: name })).toBeVisible()
}

const headerCount = (page, title) =>
  page.locator('.sidebar-section', { hasText: title }).locator('.section-count').first()

test('a resting sidebar counts nothing; a tag filter counts every section', async ({ page }) => {
  await saveTaggedDiff(page, 'E2E counted', 'finance')

  // Nothing is filtered, so no section is counting itself.
  await expect(page.locator('.section-count')).toHaveCount(0)

  await page.locator('.usb-tag', { hasText: 'finance' }).first().click()

  await expect(headerCount(page, 'Saved diffs')).toHaveText('1')
  // The sections with no match say zero rather than going quiet.
  await expect(headerCount(page, 'Snippets')).toHaveText('0')
  await expect(headerCount(page, 'External diffs')).toHaveText('0')

  // Clearing the filter puts the counts away again.
  await page.locator('.usb-tag', { hasText: 'finance' }).first().click()
  await expect(page.locator('.section-count')).toHaveCount(0)
})
