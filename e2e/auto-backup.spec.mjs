import { test, expect, openSettings } from './fixtures.mjs'

// A backup is written by the MAIN process off the back of a real store write,
// so nothing about it is visible without launching the app: the hook, the
// window, and the store files a restore replaces are all outside the renderer.

async function saveKeptDiff(page, name) {
  // The button TOGGLES, so a second call must not switch paste mode back off.
  const left = page.getByPlaceholder('Paste original text here')
  if (!(await left.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Paste text' }).click()
  }
  await left.fill('before')
  await page.getByPlaceholder('Paste changed text here').fill('after')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: name })).toBeVisible()
}

// The window that rate-limits these is covered by tests/main/autoBackup.test.js
// (isDue); what only a launch can show is that a real store write reaches it.

// The examples seeded on first launch are themselves a snippet save, so the
// very first backup is taken before the reader does anything — which is the
// behaviour wanted: protection starts immediately, not after the first hour.
test('a store save takes a backup', async ({ page }) => {
  const backups = await page.evaluate(() => window.api.listBackups())
  expect(backups.length).toBeGreaterThan(0)
  expect(backups[0].bytes).toBeGreaterThan(0)
  expect(backups[0].name).toMatch(/^diffbro-backup-\d{8}T\d{6}\.json$/)
})

test('the Storage pane offers it on by default, and can restore', async ({ page }) => {
  await saveKeptDiff(page, 'E2E restorable')
  await openSettings(page)
  await page.getByRole('button', { name: 'Storage' }).click()

  // On by default — the failure it covers gives no warning.
  await expect(page.getByText('Back up automatically')).toBeVisible()
  const toggle = page
    .locator('.setting-toggle', { hasText: 'Back up automatically' })
    .locator('input')
  await expect(toggle).toBeChecked()

  await page
    .getByRole('button', { name: /^Restore / })
    .first()
    .click()
  // Replacing your data is never one click.
  await expect(page.getByText(/Anything saved since is lost/)).toBeVisible()
  await page.getByRole('button', { name: 'Replace them' }).click()
  await expect(page.getByText(/Restored \d+ diffs and \d+ snippets/)).toBeVisible()
})
