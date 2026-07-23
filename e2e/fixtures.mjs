import { test as base, _electron as electron, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')

// A throwaway userData dir so a run never reads or clobbers the developer's real
// vault/keys/snippets, and its single-instance lock never collides with a
// Diff Bro that's already open.
export const freshUserDataDir = () => mkdtempSync(join(tmpdir(), 'diffbro-e2e-'))

// Launch the BUILT app against a given userData dir. `--user-data-dir` is a
// Chromium switch Electron honours for app.getPath('userData'), which is what
// makes each run's data (and its lock) isolated. Reused by the `app` fixture
// and by tests that need to relaunch the same profile (persistence).
export const launchApp = (userDataDir) =>
  electron.launch({ args: [MAIN, `--user-data-dir=${userDataDir}`] })

// The first window, loaded and ready to assert against.
export async function firstReadyPage(app) {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

// Fixtures for the common case: one fresh app + its window, torn down (and the
// temp profile removed) after the test.
export const test = base.extend({
  app: async ({}, use) => {
    const userDataDir = freshUserDataDir()
    const app = await launchApp(userDataDir)
    await use(app)
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  },
  page: async ({ app }, use) => {
    await use(await firstReadyPage(app))
  }
})

// Open Settings through the same path a user takes: the in-app File menu.
export async function openSettings(page) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Settings', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
}

export { expect }
