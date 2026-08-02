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

// A tool's output was reachable only through the clipboard: copy, open a new
// snippet, paste, name it. The store action for this existed and nothing called
// it — its own comment described a button that was never built.
test('a tool output is kept as a snippet, named by the user', async ({ page }) => {
  await openMenu(page, 'Tools', 'Base64')
  const tool = page.getByRole('dialog', { name: 'Base64' })
  await tool.getByRole('textbox').first().fill('keep me')

  const save = tool.getByRole('button', { name: 'Save as snippet' })
  await expect(save).toBeVisible()
  await save.click()

  // The tool is gone — not stacked under the editor — and the editor carries the
  // output with an empty name, the one thing the app cannot infer.
  await expect(tool).toHaveCount(0)
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await expect(editor).toBeVisible()
  await expect(editor.getByPlaceholder('Snippet name…')).toHaveValue('')
  await expect(editor.locator('.editor')).toContainText('a2VlcCBtZQ==')

  await editor.getByPlaceholder('Snippet name…').fill('Encoded thing')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.snippets-section .row', { hasText: 'Encoded thing' })).toBeVisible()
})

// An empty tool has nothing worth keeping, and a button that is nearly always
// disabled is noise.
test('the save action stays away until there is something to keep', async ({ page }) => {
  await openMenu(page, 'Tools', 'Base64')
  const tool = page.getByRole('dialog', { name: 'Base64' })
  await expect(tool.getByRole('button', { name: 'Save as snippet' })).toHaveCount(0)
  await tool.getByRole('textbox').first().fill('now there is')
  await expect(tool.getByRole('button', { name: 'Save as snippet' })).toBeVisible()
})
