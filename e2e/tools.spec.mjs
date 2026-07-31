import { test, expect, openMenu } from './fixtures.mjs'

// The Tools dialogs are pure-util workbenches opened from the Tools menu. Their
// utils are unit-tested; a launch proves the menu → dialog → util → output
// wiring and the OS-clipboard write.

test('Encrypt then Decrypt round-trips text under a passphrase', async ({ page }) => {
  await openMenu(page, 'Tools', 'Text Encryption', 'Encrypt / Decrypt')
  const dialog = page.getByRole('dialog', { name: 'Encrypt / Decrypt Text' })
  await expect(dialog).toBeVisible()

  await dialog.getByPlaceholder('Plain text to encrypt').fill('top secret')
  await dialog.getByLabel('Passphrase', { exact: true }).fill('correct horse battery')
  await dialog.getByRole('button', { name: 'Encrypt →' }).click()

  const output = dialog.locator('textarea[readonly]')
  await expect(output).not.toHaveValue('')
  await expect(output).not.toHaveValue('top secret')

  // Round-trip: feed the ciphertext back and decrypt with the same passphrase.
  await dialog.getByRole('button', { name: 'Use output as input' }).click()
  await dialog.getByRole('button', { name: 'Decrypt →' }).click()
  await expect(output).toHaveValue('top secret')
})

test('decrypting with the wrong passphrase fails loudly', async ({ page }) => {
  await openMenu(page, 'Tools', 'Text Encryption', 'Encrypt / Decrypt')
  const dialog = page.getByRole('dialog', { name: 'Encrypt / Decrypt Text' })

  await dialog.getByPlaceholder('Plain text to encrypt').fill('secret')
  await dialog.getByLabel('Passphrase', { exact: true }).fill('right passphrase')
  await dialog.getByRole('button', { name: 'Encrypt →' }).click()
  await dialog.getByRole('button', { name: 'Use output as input' }).click()

  await dialog.getByLabel('Passphrase', { exact: true }).fill('wrong passphrase')
  await dialog.getByRole('button', { name: 'Decrypt →' }).click()
  await expect(dialog.locator('.error')).toBeVisible()
})
