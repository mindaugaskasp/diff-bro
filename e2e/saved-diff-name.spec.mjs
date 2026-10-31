import { test, expect } from './fixtures.mjs'

const NAME = 'Release 2.0 (payments) ↔ app.config.json and everything downstream'

async function openSaveDialog(page) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('a\n')
  await page.getByPlaceholder('Paste or type the changed text').fill('b\n')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  return page.getByRole('dialog', { name: 'Save diff' })
}

test('a saved diff keeps its name, in the sidebar and on its tab', async ({ page }) => {
  const dialog = await openSaveDialog(page)
  await dialog.getByLabel('Name', { exact: true }).fill(NAME)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.locator('li.diff', { hasText: NAME })).toBeVisible()
  await expect(page.locator('.diff-tabs .tab.active')).toContainText(NAME)
})

test('Save diff opens with the name selected, so typing replaces it', async ({ page }) => {
  const dialog = await openSaveDialog(page)
  const name = dialog.getByLabel('Name', { exact: true })
  await expect(name).toBeFocused()
  const selected = await name.evaluate((el) => el.selectionEnd - el.selectionStart)
  expect(selected).toBeGreaterThan(0)
  await page.keyboard.type('Replaced')
  await expect(name).toHaveValue('Replaced')
})
