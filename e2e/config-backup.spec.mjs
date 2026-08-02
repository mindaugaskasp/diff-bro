import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  test,
  expect,
  openSettings,
  openMenu,
  stubSaveDialog,
  stubOpenDialog
} from './fixtures.mjs'

// Config backup seals identity keys, trusted hosts, snippets and settings into
// one passphrase-encrypted file; restore applies it back. The crypto is
// unit-tested — this proves the menu → dialog → file round-trip, using a known
// setting (theme) as the observable that survives the trip.
test('backing up then restoring recovers the saved settings', async ({ app, page }) => {
  const backupPath = join(tmpdir(), `diffbro-e2e-cfg-${Date.now()}.diffbroconf`)

  // A distinctive theme to carry through the backup.
  await openSettings(page)
  await page.getByRole('button', { name: 'Use the Neon theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon')
  await page.keyboard.press('Escape')

  // Back up (save dialog stubbed to a temp file).
  await stubSaveDialog(app, backupPath)
  await openMenu(page, 'Security', 'Configuration', 'Back Up')
  const backup = page.getByRole('dialog', { name: 'Back up configuration' })
  await backup.getByLabel('Passphrase').fill('backup-pass-123')
  await backup.getByRole('button', { name: 'Back up' }).click()
  await expect(page.getByText(/backed up/i)).toBeVisible()

  // Change the theme away from the backed-up value.
  await openMenu(page, 'View', 'Toggle Light/Dark Theme') // neon is dark-ground → light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // Restore brings it back.
  await stubOpenDialog(app, backupPath)
  await openMenu(page, 'Security', 'Configuration', 'Restore')
  const restore = page.getByRole('dialog', { name: 'Restore configuration' })
  await restore.getByLabel('Passphrase').fill('backup-pass-123')
  await restore.getByRole('button', { name: 'Restore' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon')
})

test('restore rejects a wrong passphrase', async ({ app, page }) => {
  const backupPath = join(tmpdir(), `diffbro-e2e-cfg-wrong-${Date.now()}.diffbroconf`)

  await stubSaveDialog(app, backupPath)
  await openMenu(page, 'Security', 'Configuration', 'Back Up')
  const backup = page.getByRole('dialog', { name: 'Back up configuration' })
  await backup.getByLabel('Passphrase').fill('the-right-one')
  await backup.getByRole('button', { name: 'Back up' }).click()
  await expect(page.getByText(/backed up/i)).toBeVisible()

  await stubOpenDialog(app, backupPath)
  await openMenu(page, 'Security', 'Configuration', 'Restore')
  const restore = page.getByRole('dialog', { name: 'Restore configuration' })
  await restore.getByLabel('Passphrase').fill('the-wrong-one')
  await restore.getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByText(/Wrong passphrase/i)).toBeVisible()
})

// Restoring a backup taken on another machine replaces this install's identity.
// rotateIdentity is careful to keep the outgoing key as decrypt-only precisely
// so unopened diffs still open; restore used to destroy it outright, which is
// the same data loss by a different door. Only a real identity store shows it.
test('restoring an identity retires the outgoing key instead of destroying it', async ({
  app,
  page
}) => {
  const backupPath = join(tmpdir(), `diffbro-e2e-cfg-identity-${Date.now()}.diffbroconf`)
  const fingerprintOf = () => page.evaluate(() => window.api.myFingerprint())
  const retiredCount = () => page.evaluate(() => window.api.retiredKeyCount())

  // Back up identity A, then rotate so the install is on a different identity.
  await stubSaveDialog(app, backupPath)
  await openMenu(page, 'Security', 'Configuration', 'Back Up')
  const backup = page.getByRole('dialog', { name: 'Back up configuration' })
  await backup.getByLabel('Passphrase').fill('identity-pass-123')
  await backup.getByRole('button', { name: 'Back up' }).click()
  await expect(page.getByText(/backed up/i)).toBeVisible()
  const identityA = await fingerprintOf()

  await openMenu(page, 'Security', 'Replace My Key…')
  const rotate = page.getByRole('dialog', { name: 'Replace my key' })
  await rotate.getByRole('button', { name: 'Replace my key' }).click()
  await expect(rotate).toContainText(/new fingerprint/i)
  await page.keyboard.press('Escape')

  const identityB = await fingerprintOf()
  expect(identityB).not.toBe(identityA)
  expect(await retiredCount()).toBe(1) // A, retired by the rotation

  // Restoring the backup puts identity A back...
  await stubOpenDialog(app, backupPath)
  await openMenu(page, 'Security', 'Configuration', 'Restore')
  const restore = page.getByRole('dialog', { name: 'Restore configuration' })
  await restore.getByLabel('Passphrase').fill('identity-pass-123')
  await restore.getByRole('button', { name: 'Restore' }).click()

  await expect.poll(fingerprintOf).toBe(identityA)
  // ...and B is kept as decrypt-only rather than dropped, so anything sealed to
  // B and not yet imported can still be opened.
  expect(await retiredCount()).toBe(2)
})
