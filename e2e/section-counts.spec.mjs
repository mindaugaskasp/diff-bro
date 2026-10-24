import { test, expect, pickTag, showPanel } from './fixtures.mjs'

// A panel with no match shows zero: that is the answer to "why is this empty".
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
  page.locator('.sidebar-section', { hasText: title }).locator('.count-chip').first()
const mineCount = (page) => page.getByRole('button', { name: /^Mine/ }).locator('.count-chip')

test('a panel counts its rows, a tag filter narrows the count, and none reads zero', async ({
  page
}) => {
  await saveTaggedDiff(page, 'E2E counted', 'finance')
  await showPanel(page, 'diffs')
  await expect(mineCount(page)).toHaveText('1')

  await pickTag(page, 'finance')
  await expect(mineCount(page)).toHaveText('1')
  await page.getByPlaceholder('Search diffs').fill('no-such-diff')
  await expect(mineCount(page)).toHaveText('0')
  await page.getByPlaceholder('Search diffs').fill('')
  // The same filter in the other panel says zero rather than going quiet.
  await showPanel(page, 'snippets')
  await expect(headerCount(page, 'Snippets')).toHaveText('0')

  await pickTag(page, 'finance')
  await expect(headerCount(page, 'Snippets')).not.toHaveText('0')
})
