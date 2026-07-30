import { test, expect, openMenu } from './fixtures.mjs'

// The JWT tool is a rich panel (ToolJwt): decodes header + payload, humanizes the
// time claims, flags alg/expiry — never verifies the signature. A launch proves
// the menu → panel → pure-util wiring and the clipboard write.
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
  '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

test('decodes header/payload, humanizes claims, and copies the payload', async ({ app, page }) => {
  await openMenu(page, 'Tools', 'JWT Decode')
  const dlg = page.getByRole('dialog', { name: 'JWT' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('JWT').fill(JWT)

  await expect(dlg.locator('.tj-badge')).toHaveText('HS256')
  await expect(dlg.locator('.tj-json').first()).toContainText('"alg": "HS256"')
  await expect(dlg.locator('.tj-json').nth(1)).toContainText('"name": "John Doe"')
  await expect(dlg.locator('.tj-claim', { hasText: 'iat' })).toContainText('ago')

  await dlg.locator('.tj-block').nth(1).locator('.tj-copy').click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toContain('"name": "John Doe"')
})

test('reports a malformed token', async ({ page }) => {
  await openMenu(page, 'Tools', 'JWT Decode')
  const dlg = page.getByRole('dialog', { name: 'JWT' })
  await dlg.getByLabel('JWT').fill('not-a-jwt')
  await expect(dlg.locator('.tj-err')).toBeVisible()
})
