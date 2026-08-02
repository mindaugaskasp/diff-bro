import { test, expect, openMenu } from './fixtures.mjs'

// Rotation only means anything across a real identity store: the old private
// key has to survive in userData as decrypt-only, and the new one has to be
// what gets signed with. Neither is observable without launching the app.

const fingerprintOf = (page) => page.evaluate(() => window.api.myFingerprint())

test('replacing the key changes the fingerprint and keeps the old one for reading', async ({
  page
}) => {
  const before = await fingerprintOf(page)
  expect(before).toMatch(/^[0-9a-f]{32}$/)
  expect(await page.evaluate(() => window.api.retiredKeyCount())).toBe(0)

  await openMenu(page, 'Security', 'Replace My Key…')
  const dialog = page.getByRole('dialog', { name: 'Replace my key' })
  await expect(dialog).toBeVisible()

  // The copy has to say the thing people get wrong: this cannot un-send.
  await expect(dialog).toContainText(/cannot take anything back/i)

  await dialog.getByRole('button', { name: 'Replace my key' }).click()
  await expect(dialog).toContainText(/new fingerprint/i)

  const after = await fingerprintOf(page)
  expect(after).toMatch(/^[0-9a-f]{32}$/)
  expect(after).not.toBe(before)
  // The old key is retired, not destroyed — a diff already sealed to it still
  // has a key on this machine that can read it.
  expect(await page.evaluate(() => window.api.retiredKeyCount())).toBe(1)
})

test('destroying the retired keys is a second, deliberate step', async ({ page }) => {
  await openMenu(page, 'Security', 'Replace My Key…')
  const dialog = page.getByRole('dialog', { name: 'Replace my key' })
  await dialog.getByRole('button', { name: 'Replace my key' }).click()
  await expect(dialog).toContainText(/new fingerprint/i)

  // Guarded behind its own acknowledgement, never folded into the rotation.
  const destroy = dialog.getByRole('button', { name: /Destroy old key/ })
  await expect(destroy).toBeDisabled()
  await dialog.getByRole('checkbox').check()
  await expect(destroy).toBeEnabled()
  await destroy.click()

  await expect.poll(() => page.evaluate(() => window.api.retiredKeyCount())).toBe(0)
})
