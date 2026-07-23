import { rmSync } from 'node:fs'
import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

// Saving a diff drives the whole vault round-trip: the snapshot is AES-GCM
// encrypted in the main process (vault:encrypt, key behind safeStorage), written
// to the data-dir store, and must decrypt back after a relaunch (vault:decrypt)
// to reappear in the sidebar and reopen. None of that is reachable in jsdom —
// the key never enters the renderer. Manages its own launch/relaunch on one
// profile, like the theme-persistence test.
test('a saved diff persists across a relaunch and reopens', async () => {
  const userDataDir = freshUserDataDir()
  const NAME = 'E2E round-trip diff'
  try {
    let app = await launchApp(userDataDir)
    let page = await firstReadyPage(app)

    // Make something saveable via paste-compare (no file dialog needed).
    await page.getByRole('button', { name: 'Paste text' }).click()
    await page.getByPlaceholder('Paste original text here').fill('one\ntwo')
    await page.getByPlaceholder('Paste changed text here').fill('one\nZULU')
    await page.getByRole('button', { name: 'Compare', exact: true }).click()

    // Save it under a known name.
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Save diff' })
    await dialog.getByLabel('Name', { exact: true }).fill(NAME)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()

    // It confirms with a toast and lands in the Saved diffs sidebar.
    await expect(page.getByText('Saved (encrypted)')).toBeVisible()
    await expect(page.getByText(NAME)).toBeVisible()
    await app.close()

    // Relaunch the same profile: the encrypted entry must decrypt and list.
    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    const row = page.getByText(NAME)
    await expect(row).toBeVisible()

    // Reopening restores the diff — vault:decrypt of the snapshot, then Monaco
    // repaints the changed side (ZULU exists only on the right).
    await row.click()
    await expect(page.getByText('ZULU').first()).toBeVisible()
    await app.close()
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
