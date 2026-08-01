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
    await expect(page.getByText(/^Saved —/)).toBeVisible()
    // The name is now in two places — the sidebar row and the tab it was saved
    // from — so both are named explicitly.
    await expect(page.locator('li.diff', { hasText: NAME })).toBeVisible()
    await expect(page.locator('.diff-tabs .tab', { hasText: NAME })).toBeVisible()
    await app.close()

    // Relaunch the same profile: the encrypted entry must decrypt and list.
    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    const row = page.locator('li.diff', { hasText: NAME })
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

// Filtering to nothing has to say so. Snippets did; Saved diffs and External
// diffs rendered an empty box, so a search that matched nothing looked broken.
test('a filter that matches nothing says so in every sidebar section', async () => {
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await page.getByRole('button', { name: 'Paste text' }).click()
    await page.getByPlaceholder('Paste original text here').fill('alpha')
    await page.getByPlaceholder('Paste changed text here').fill('beta')
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const save = page.getByRole('dialog', { name: 'Save diff' })
    await save.getByLabel('Name', { exact: true }).fill('Findable diff')
    await save.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('li.diff', { hasText: 'Findable diff' })).toBeVisible()

    await page.getByPlaceholder('Search diffs & snippets…').fill('zzz-no-such-thing')

    const saved = page.locator('.sidebar-section', { hasText: 'Saved diffs' })
    await expect(saved.locator('li.diff')).toHaveCount(0)
    await expect(saved.getByText(/try removing a filter/)).toBeVisible()
    await expect(page.getByText('No snippets match — try removing a filter.')).toBeVisible()
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// Retention is a local choice, capped at a week. The sealed-share ceiling is a
// separate, shorter one that sealing.js enforces at both ends.
test('a diff can be kept for as long as a week', async () => {
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await page.getByRole('button', { name: 'Paste text' }).click()
    await page.getByPlaceholder('Paste original text here').fill('alpha')
    await page.getByPlaceholder('Paste changed text here').fill('beta')
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    const save = page.getByRole('dialog', { name: 'Save diff' })
    const expiry = save.getByLabel('Expires after')
    await expect(expiry.locator('option')).toHaveText([
      '1 hour',
      '8 hours',
      '24 hours',
      '2 days',
      '3 days',
      '1 week'
    ])
    await save.getByLabel('Name', { exact: true }).fill('Long lived')
    await expiry.selectOption({ label: '1 week' })
    await expect(save.getByText(/a week is the longest/)).toBeVisible()
    await save.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.locator('li.diff', { hasText: 'Long lived' })).toBeVisible()
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
