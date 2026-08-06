import { test, expect, openSettings } from './fixtures.mjs'

// A backup is written by the MAIN process off the back of a real store write,
// so nothing about it is visible without launching the app: the hook, the
// window, and the store files a restore replaces are all outside the renderer.

async function saveKeptDiff(page, name) {
  // The button TOGGLES, so a second call must not switch paste mode back off.
  const left = page.getByPlaceholder('Paste original text here')
  if (!(await left.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Paste mode' }).click()
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

// The pane never said what the backups cost, and the only way to reclaim any was
// deleting files by hand in the folder that holds the reader's keys.
test('the storage pane reports what backups cost and offers the age back', async ({ page }) => {
  await saveKeptDiff(page, 'Uses space')
  await openSettings(page)
  await page.getByRole('button', { name: /Storage/ }).click()

  // The size is real, not a placeholder.
  const line = page.locator('.hint', { hasText: 'on disk' })
  await expect(line).toBeVisible()
  const shown = await line.innerText()
  expect(shown).toMatch(/\d+(\.\d+)?\s?(B|KB|MB)/)

  // Every backup here was just written, so nothing is a week old and the button
  // says so rather than offering a delete that would remove nothing.
  const prune = page.locator('.prune button.btn')
  await expect(prune).toHaveText('Nothing that old')
  await expect(prune).toBeDisabled()
})

// The handler takes an AGE, never a filename — a renderer that can name a file
// is a renderer that can name the wrong one.
test('the prune handler refuses an age it does not offer', async ({ page }) => {
  const bad = await page.evaluate(async () => [
    await window.api.pruneBackups(9999),
    await window.api.pruneBackups('7'),
    await window.api.pruneBackups(-1)
  ])
  for (const res of bad) expect(res).toEqual({ ok: false, error: 'bad-request' })

  // ...and still holds the backups it was asked to spare.
  const kept = await page.evaluate(() => window.api.listBackups())
  expect(kept.length).toBeGreaterThan(0)
})
