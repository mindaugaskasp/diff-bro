import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, openSettings, openMenu, stubSaveDialog, stubOpenDialog } from './fixtures.mjs'

// Config backup seals identity keys, trusted hosts, snippets and settings into
// one passphrase-encrypted file; restore applies it back. The crypto is
// unit-tested — this proves the menu → dialog → file round-trip, using a known
// setting (theme) as the observable that survives the trip.
test('backing up then restoring recovers the saved settings', async ({ app, page }) => {
  const backupPath = join(tmpdir(), `diffbro-e2e-cfg-${Date.now()}.diffbroconf`)

  // A distinctive theme to carry through the backup.
  await openSettings(page)
  await page.getByTitle('Use the Neon theme').click()
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
