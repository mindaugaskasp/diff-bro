import { test, expect, openMenu } from './fixtures.mjs'

// Base64 is a rich panel (ToolBase64): an Encode/Decode toggle with live output,
// URL-safe alphabet, MIME wrap, and byte counts. A launch proves the wiring, the
// live reactivity, and the clipboard write.

test('encodes live, decodes back via the toggle, and copies', async ({ app, page }) => {
  await openMenu(page, 'Tools', 'Base64')
  const dlg = page.getByRole('dialog', { name: 'Base64' })
  await expect(dlg).toBeVisible()

  await dlg.getByLabel('Base64 input').fill('Diff Bro')
  await expect(dlg.locator('.tb-text')).toHaveText('RGlmZiBCcm8=')

  await dlg.locator('.tb-copy').click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toBe('RGlmZiBCcm8=')

  await dlg.locator('.seg-opt', { hasText: 'Decode' }).click()
  await dlg.getByLabel('Base64 input').fill('RGlmZiBCcm8=')
  await expect(dlg.locator('.tb-text')).toHaveText('Diff Bro')
})

test('URL-safe strips padding, and invalid Base64 is reported', async ({ page }) => {
  await openMenu(page, 'Tools', 'Base64')
  const dlg = page.getByRole('dialog', { name: 'Base64' })

  await dlg.getByLabel('Base64 input').fill('hello')
  await expect(dlg.locator('.tb-text')).toHaveText('aGVsbG8=')
  await dlg.getByLabel('URL-safe', { exact: true }).check()
  await expect(dlg.locator('.tb-text')).toHaveText('aGVsbG8')

  await dlg.locator('.seg-opt', { hasText: 'Decode' }).click()
  await dlg.getByLabel('Base64 input').fill('%%% not base64 %%%')
  await expect(dlg.locator('.tb-err')).toBeVisible()
})
