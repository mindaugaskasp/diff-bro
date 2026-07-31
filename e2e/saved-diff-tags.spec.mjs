import { test, expect } from './fixtures.mjs'

// Tagging a saved diff only reads true in a launched app: the tag lands in the
// plaintext metadata beside the ciphertext, and the sidebar row renders from
// that. The reported bug was a JSON diff showing "Untagged" with a tag applied,
// which is a rendered fact jsdom cannot answer.

// Two .json sides, so the diff's format is json — the tag that used to be
// swallowed. A pasted file name is what gives the diff its format.
async function saveJsonDiff(page, name, tag) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('{\n  "a": 1\n}')
  await page.getByPlaceholder('Paste changed text here').fill('{\n  "a": 2\n}')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  if (tag) {
    await dialog.getByPlaceholder('add a tag…').fill(tag)
    await dialog.getByPlaceholder('add a tag…').press('Enter')
  }
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(name)).toBeVisible()
  return page.locator('li.diff', { hasText: name })
}

test('a diff saved with a tag shows that tag, not "Untagged"', async ({ page }) => {
  const row = await saveJsonDiff(page, 'E2E tagged diff', 'release')
  await expect(row.getByText('release')).toBeVisible()
  await expect(row.getByText('Untagged')).toHaveCount(0)
})

test('a diff saved without a tag still reads as Untagged', async ({ page }) => {
  const row = await saveJsonDiff(page, 'E2E bare diff', null)
  await expect(row.getByText('Untagged')).toBeVisible()
})

test('a saved diff can be retagged after the fact', async ({ page }) => {
  const row = await saveJsonDiff(page, 'E2E retag me', null)
  await expect(row.getByText('Untagged')).toBeVisible()

  await row.hover()
  await row.getByRole('button', { name: 'Edit tags' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit tags' })
  await dialog.getByPlaceholder('add a tag…').fill('reviewed')
  await dialog.getByPlaceholder('add a tag…').press('Enter')
  await dialog.getByRole('button', { name: 'Save tags' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(row.getByText('reviewed')).toBeVisible()
  await expect(row.getByText('Untagged')).toHaveCount(0)
})
