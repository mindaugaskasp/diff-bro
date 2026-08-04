import { defineConfig } from '@playwright/test'

// End-to-end tests drive the app's OWN Electron build through Playwright's
// `_electron` (see e2e/fixtures.mjs) — there is no web server and no bundled
// browser, so nothing here downloads or launches Chromium/Firefox/WebKit.
//
// Run them in the Docker test env (`make e2e`), where a virtual display is up
// and DIFFBRO_DOCKER applies the headless Chromium switches. Each test launches
// its own Electron instance against a throwaway userData dir, so runs never
// touch the developer's real keys/snippets/diffs and never fight the
// single-instance lock of a running Diff Bro.
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.mjs$/,
  // By FILE, not by test: order within a spec is what the relaunch specs assume.
  // Isolation is e2e/workerEnv.mjs; E2E_WORKERS also sizes the display pool.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 4),
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  // On CI also emit a self-contained HTML report (uploaded as an artifact) so a
  // failure can be inspected without re-running; locally the list reporter is
  // enough. Traces/screenshots are captured per-test in e2e/fixtures.mjs (the
  // `use.trace` option doesn't apply to Electron's own context).
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']]
})
