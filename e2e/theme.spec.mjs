import { rmSync } from 'node:fs'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  openSettings
} from './fixtures.mjs'

// Picking a theme must (1) apply to the document immediately and (2) survive a
// relaunch — persistence goes through the main-process data-dir store, not just
// in-memory state, so this drives the whole IPC round-trip. Manages its own
// launch/relaunch against one profile instead of the per-test `app` fixture.
test('a chosen theme applies at once and persists across a relaunch', async () => {
  const userDataDir = freshUserDataDir()
  try {
    let app = await launchApp(userDataDir)
    let page = await firstReadyPage(app)

    // Light is the default ground on a fresh profile.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await openSettings(page)
    await page.getByRole('button', { name: 'Use the Neon theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon')
    await app.close()

    // Relaunch the same profile: the choice was written to userData and reloads.
    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon')
    await app.close()
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
