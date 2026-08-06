import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'
import { test, expect, clickAppMenuItem, freshUserDataDir } from './fixtures.mjs'
import { workerEnv } from './workerEnv.mjs'

// The Windows login item launches with `--hidden`. Two things have to hold, and
// both fail silently: the CLI parser must not treat the flag as a malformed
// command (that path calls app.exit(1), so signing in would kill the app before
// a window existed), and the window must be BUILT but not shown — the global
// shortcut and the tray both need something to raise.
//
// Not Windows-gated: `--hidden` is handled by platform-independent code, and a
// spec that only runs where nobody runs the suite proves nothing.

const MAIN = join(fileURLToPath(new URL('..', import.meta.url)), 'build', 'main', 'index.js')

const launchWith = (dir, extra = []) =>
  electron.launch({ args: [MAIN, `--user-data-dir=${dir}`, ...extra], env: workerEnv(dir) })

async function firstWindowVisible(app) {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const win = await app.browserWindow(page)
  return win.evaluate((w) => w.isVisible())
}

test('--hidden starts in the background with the window built but not shown', async () => {
  const dir = freshUserDataDir()
  const app = await launchWith(dir, ['--hidden'])
  try {
    expect(await firstWindowVisible(app)).toBe(false)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an ordinary launch still shows its window', async () => {
  const dir = freshUserDataDir()
  const app = await launchWith(dir)
  try {
    expect(await firstWindowVisible(app)).toBe(true)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// The tray is Windows-only, so everywhere else the Settings pane for it must not
// appear — two toggles that do nothing is worse than none.
test('the Desktop settings pane is absent where there is no tray', async ({ app, page }) => {
  test.skip(process.platform === 'win32', 'the pane is expected here')

  await clickAppMenuItem(app, 'Settings')
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Desktop', exact: true })).toHaveCount(0)

  // Main agrees, so the hidden pane and the absent capability cannot disagree.
  expect(await page.evaluate(() => window.api.traySupported())).toBe(false)
})
