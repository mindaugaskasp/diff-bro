import { test, expect, openMenu } from './fixtures.mjs'

// The URL tool is a rich panel (ToolUrl): explicit encode/decode with a
// component/full-URI toggle, and an editable query-param table that rebuilds the
// URL live. A launch proves the wiring, the reactivity, and the clipboard write.

test('encodes and decodes, honoring component vs full-URI', async ({ page }) => {
  await openMenu(page, 'Tools', 'URL Encode / Decode')
  const dlg = page.getByRole('dialog', { name: 'URL' })
  await expect(dlg).toBeVisible()
  const inp = dlg.getByLabel('URL or text')

  await inp.fill('a b/c')
  await expect(dlg.locator('.tur-out-v')).toHaveText('a%20b%2Fc') // encode · component
  await dlg.locator('.seg-opt', { hasText: 'Full URI' }).click()
  await expect(dlg.locator('.tur-out-v')).toHaveText('a%20b/c') // encode · full keeps '/'

  await dlg.locator('.seg-opt', { hasText: 'Decode' }).click()
  await inp.fill('a%20b%2Fc')
  await expect(dlg.locator('.tur-out-v')).toHaveText('a b%2Fc') // decode · full keeps %2F
  await dlg.locator('.seg-opt', { hasText: 'Component' }).click()
  await expect(dlg.locator('.tur-out-v')).toHaveText('a b/c') // decode · component
})

test('the editable query-param table rebuilds the URL live and copies it', async ({
  app,
  page
}) => {
  await openMenu(page, 'Tools', 'URL Encode / Decode')
  const dlg = page.getByRole('dialog', { name: 'URL' })
  await dlg.getByLabel('URL or text').fill('https://x.io/p?q=hello%20world&utm=a')

  const rows = dlg.locator('.tur-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.first().locator('.tur-cell').nth(1)).toHaveValue('hello world') // decoded

  await rows.first().locator('.tur-cell').nth(1).fill('a & b')
  const rebuilt = dlg.locator('.tur-params .tur-out-v')
  await expect(rebuilt).toHaveText('https://x.io/p?q=a%20%26%20b&utm=a')

  await dlg.locator('.tur-params .tur-copy').click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toBe('https://x.io/p?q=a%20%26%20b&utm=a')
})
