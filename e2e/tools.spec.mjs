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

test('JSON tool validates input and only formats when valid', async ({ page }) => {
  await openMenu(page, 'Tools', 'JSON', 'Format / Validate')
  const dialog = page.getByRole('dialog', { name: /JSON/ })
  await expect(dialog).toBeVisible()
  const editor = dialog.locator('.editor')

  // Monaco auto-closes brackets, so we type only the opener + contents. A
  // trailing comma makes it invalid → status invalid, Format disabled.
  await editor.click()
  await page.keyboard.type('[1,2,')
  await expect(dialog.locator('.status.invalid')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Format' })).toBeDisabled()

  // Replace with valid content → status flips and Format enables + pretty-prints.
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await page.keyboard.type('[1,2')
  await expect(dialog.locator('.status.valid')).toBeVisible()
  const format = dialog.getByRole('button', { name: 'Format' })
  await expect(format).toBeEnabled()
  await format.click()
  // A formatted array spans multiple lines.
  await expect(dialog.locator('.view-line')).toHaveCount(4)
})

test('Encrypt then Decrypt round-trips text under a passphrase', async ({ page }) => {
  await openMenu(page, 'Tools', 'Text Encryption', 'Encrypt / Decrypt')
  const dialog = page.getByRole('dialog', { name: 'Encrypt / Decrypt Text' })
  await expect(dialog).toBeVisible()

  await dialog.getByPlaceholder('Plain text to encrypt').fill('top secret')
  await dialog.getByLabel('Passphrase').fill('correct horse battery')
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
  await dialog.getByLabel('Passphrase').fill('right passphrase')
  await dialog.getByRole('button', { name: 'Encrypt →' }).click()
  await dialog.getByRole('button', { name: 'Use output as input' }).click()

  await dialog.getByLabel('Passphrase').fill('wrong passphrase')
  await dialog.getByRole('button', { name: 'Decrypt →' }).click()
  await expect(dialog.locator('.error')).toBeVisible()
})
