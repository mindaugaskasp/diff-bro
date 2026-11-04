import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, openSettingsPage, stubMessageBox, stubOpenDialog } from './fixtures.mjs'

// #233: changing the data folder restarts the app, so it is confirmed first.
test('Cancel on the restart confirm leaves the data folder where it is', async ({ app, page }) => {
  const target = mkdtempSync(join(tmpdir(), 'diffbro-datadir-'))
  try {
    const dialog = await openSettingsPage(page, 'Storage')
    const before = await dialog.locator('code[title]').textContent()
    await stubOpenDialog(app, target)
    await stubMessageBox(app, 1)
    await dialog.getByRole('button', { name: 'Change folder…' }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('code[title]')).toHaveText(before)
    expect(app.windows().length).toBeGreaterThan(0)
  } finally {
    rmSync(target, { recursive: true, force: true })
  }
})
