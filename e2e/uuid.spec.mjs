import { test, expect, openMenu } from './fixtures.mjs'

// The UUID tool is a rich panel (ToolUuid): generate versions, inspect a pasted
// UUID, and convert its forms in either direction — a launch proves the menu →
// panel → pure-util wiring and the OS-clipboard write.

test('generates a v4 UUID and copies the formatted value', async ({ app, page }) => {
  await openMenu(page, 'Tools', 'UUID')
  const dlg = page.getByRole('dialog', { name: 'UUID' })
  await expect(dlg).toBeVisible()

  const field = dlg.getByLabel('UUID', { exact: true })
  await expect(field).toHaveValue(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  )

  await dlg.locator('.tu-copy').click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toBe(await field.inputValue())
})

test('reverse-converts a pasted 32-hex to canonical and shows its version', async ({ page }) => {
  await openMenu(page, 'Tools', 'UUID')
  const dlg = page.getByRole('dialog', { name: 'UUID' })
  await dlg.getByLabel('UUID', { exact: true }).fill('886313e13b8a53729b900c9aee199e5d')
  await expect(dlg.locator('.tu-out-v')).toHaveText('886313e1-3b8a-5372-9b90-0c9aee199e5d')
  await expect(dlg.locator('.tu-badge')).toContainText('v5')
})

test('v5 verify confirms a matching UUID and rejects a mismatch', async ({ page }) => {
  await openMenu(page, 'Tools', 'UUID')
  const dlg = page.getByRole('dialog', { name: 'UUID' })
  await dlg.locator('.seg-opt', { hasText: 'v5' }).click()
  await dlg.getByLabel('Name', { exact: true }).fill('example.com')
  // DNS + example.com is the documented v5 reference value.
  await expect(dlg.getByLabel('UUID', { exact: true })).toHaveValue(
    'cfbff0d1-9375-5685-968c-48ce8b15ae17'
  )
  const verify = dlg.getByLabel('Verify UUID', { exact: true })
  await verify.fill('cfbff0d1-9375-5685-968c-48ce8b15ae17')
  await expect(dlg.locator('.tu-match.ok')).toHaveText('match')
  await verify.fill('00000000-0000-0000-0000-000000000000')
  await expect(dlg.locator('.tu-match')).toHaveText('no match')
  await expect(dlg.locator('.tu-match.ok')).toHaveCount(0)
})
