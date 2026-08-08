import { test, expect, openSettings, stubMessageBox } from './fixtures.mjs'

// Installing the `diffbro` shim from Settings. The buttons reach window.api,
// which only exists on the real preload — and a Vue TEMPLATE does not resolve
// `window` at all (it is not in Vue's allowed globals), so this path can only
// be proven by clicking it in a launched app.
test('the terminal-command buttons actually reach the installer', async ({ app, page }) => {
  // Installing writes an executable onto PATH, so main confirms first.
  await stubMessageBox(app)
  await openSettings(page)
  await page.locator('.settings-nav .nav-item', { hasText: 'Terminal' }).click()

  const install = page.getByRole('button', { name: /^(Install|Reinstall)$/ })
  await expect(install).toBeVisible()
  await install.click()

  // The handler ran: the shim is reported as installed.
  await expect(page.locator('.badge', { hasText: 'installed' })).toBeVisible()
  // …and nothing blew up on the way.
  await expect(page.getByRole('dialog', { name: 'Something went wrong' })).toHaveCount(0)

  // Remove is the same path in reverse.
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('.badge', { hasText: 'installed' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Something went wrong' })).toHaveCount(0)
})
