import { test, expect, clickAppMenuItem } from './fixtures.mjs'

async function openSaveDialog(page) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('a\n')
  await page.getByPlaceholder('Paste or type the changed text').fill('b\n')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  return page.getByRole('dialog', { name: 'Save diff' })
}

const shape = (dialog) =>
  dialog.evaluate((el) => {
    const { x, y, width, height } = el.getBoundingClientRect()
    return { x, y, width, height }
  })

test('turning Secure off disables the expiry and keeps the dialog still', async ({ page }) => {
  const dialog = await openSaveDialog(page)
  const secure = dialog.getByRole('checkbox', { name: /Secure/ })
  const expiry = dialog.getByLabel('Expires after')
  await expect(expiry).toBeEnabled()
  await expiry.selectOption({ label: '1 week' })
  const resting = await shape(dialog)

  await secure.uncheck()
  await expect(expiry).toBeDisabled()
  await expect(dialog.getByText('Kept until you delete it.')).toBeVisible()
  await expect(dialog.getByText(/a week is the longest/)).toBeHidden()
  expect(await shape(dialog)).toEqual(resting)

  await secure.check()
  await expect(expiry).toBeEnabled()
  await expect(expiry).toHaveValue('168')
  await expect(dialog.getByText(/a week is the longest/)).toBeVisible()
  await expect(dialog.getByText('Kept until you delete it.')).toBeHidden()
  expect(await shape(dialog)).toEqual(resting)
})

test('a diff saved with Secure off reopens with the expiry disabled', async ({ app, page }) => {
  const dialog = await openSaveDialog(page)
  await dialog.getByRole('checkbox', { name: /Secure/ }).uncheck()
  await dialog.getByLabel('Name', { exact: true }).fill('Kept')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: 'Kept' })).toBeVisible()

  await clickAppMenuItem(app, 'Swap Sides')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const again = page.getByRole('dialog', { name: 'Update diff' })
  await expect(again.getByLabel('Expires after')).toBeDisabled()
})
