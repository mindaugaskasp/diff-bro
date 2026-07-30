import { test, expect, openMenu } from './fixtures.mjs'

// The Tools dialogs are pure-util workbenches opened from the Tools menu. Their
// utils are unit-tested; a launch proves the menu → dialog → util → output
// wiring and the OS-clipboard write.

test('Base64 encodes, then decodes back to the original', async ({ app, page }) => {
  await openMenu(page, 'Tools', 'Base64', 'Encode / Decode')
  const dialog = page.getByRole('dialog', { name: 'Base64 Encode / Decode' })
  await expect(dialog).toBeVisible()

  await dialog.getByPlaceholder('Text or Base64…').fill('Diff Bro')
  await dialog.getByRole('button', { name: 'Encode →' }).click()
  const output = dialog.locator('textarea[readonly]')
  await expect(output).toHaveValue('RGlmZiBCcm8=')

  await dialog.getByRole('button', { name: 'Use as Input' }).click()
  await dialog.getByRole('button', { name: 'Decode →' }).click()
  await expect(output).toHaveValue('Diff Bro')

  // Copy writes to the real OS clipboard (via the main process).
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toBe('Diff Bro')
})

test('invalid Base64 is reported, not silently wrong', async ({ page }) => {
  await openMenu(page, 'Tools', 'Base64', 'Encode / Decode')
  const dialog = page.getByRole('dialog', { name: 'Base64 Encode / Decode' })
  await dialog.getByPlaceholder('Text or Base64…').fill('not valid base64 !!!')
  await dialog.getByRole('button', { name: 'Decode →' }).click()
  await expect(dialog.locator('.error')).toContainText('Not valid Base64')
})

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
