import { test as base, _electron as electron, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { workerEnv } from './workerEnv.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')

// A throwaway userData dir so a run never reads or clobbers the developer's real
// vault/keys/snippets, and its single-instance lock never collides with a
// Diff Bro that's already open.
//
// Tips are OFF in it by default. Every profile here is cold, which is exactly
// what the onboarding tour fires on, and its veil takes the pointer for the
// whole window — left on, it intercepts the first click of nearly every spec in
// this suite. `{ tips: true }` asks for it back; only the tour's own spec does.
export const freshUserDataDir = ({ tips = false } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-e2e-'))
  if (!tips) writeFileSync(join(dir, 'onboarding.json'), JSON.stringify({ showTips: false }))
  return dir
}

// Launch the BUILT app against a given userData dir. `--user-data-dir` is a
// Chromium switch Electron honours for app.getPath('userData'), which is what
// makes each run's data (and its lock) isolated. Reused by the `app` fixture
// and by tests that need to relaunch the same profile (persistence).
// Not in the `app` fixture: the persistence specs call this directly, and would
// launch unisolated. workerEnv.mjs says what each variable stops leaking.
export const launchApp = (userDataDir) =>
  electron.launch({ args: [MAIN, `--user-data-dir=${userDataDir}`], env: workerEnv(userDataDir) })

// The first window, loaded and ready to assert against.
export async function firstReadyPage(app) {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

// Fixtures for the common case: one fresh app + its window, torn down (and the
// temp profile removed) after the test.
export const test = base.extend({
  // Per-file: `test.use({ tips: true })` launches with the onboarding tour armed.
  tips: [false, { option: true }],
  app: async ({ tips }, use) => {
    const userDataDir = freshUserDataDir({ tips })
    const app = await launchApp(userDataDir)
    // Trace the whole run (with screenshots); keep it only when the test fails,
    // attached so it shows up in the HTML report and as a CI artifact. Electron
    // has its own BrowserContext, so tracing is wired here rather than via the
    // config's `use.trace`, which only covers Playwright-launched browsers.
    await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true })
    await use(app)
    const info = test.info()
    const failed = info.status !== info.expectedStatus
    const tracePath = info.outputPath('trace.zip')
    await app.context().tracing.stop(failed ? { path: tracePath } : {})
    if (failed) await info.attach('trace', { path: tracePath, contentType: 'application/zip' })
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  },
  // Every test is also a detector for an uncaught renderer error. Nothing here
  // asserts it on purpose — the point is the ones that slip through a flow
  // nobody wrote a test for. A template reaching `window` threw on click for
  // months without a single spec noticing, because no spec clicked that button.
  page: async ({ app }, use) => {
    const page = await firstReadyPage(app)
    const thrown = []
    page.on('pageerror', (err) => thrown.push(err.message))
    await use(page)
    // The app catches renderer errors and shows this dialog rather than letting
    // them reach `pageerror`, so both have to be looked at.
    const shown = await page
      .locator('.err-msg')
      .allTextContents()
      .catch(() => [])
    // The same benign framework noise the app itself classifies as ignorable
    // (errorStore's IGNORED): a Monaco cancellation fires whenever a model is
    // disposed mid-operation, which a test that deletes things does routinely.
    const NOISE = /cancell?ed|ResizeObserver loop|^Script error\.?$/i
    const seen = [...thrown, ...shown].filter((m) => !NOISE.test(m))
    if (seen.length) {
      throw new Error(`the renderer reported an error during this test: ${seen.join(' · ')}`)
    }
  }
})

// Click an application-menu item by label. The in-app MenuBar.vue only exists on
// Windows/Linux (macOS keeps the native bar), so anything that must work on both
// — or that runs with no window at all — goes through the menu Electron owns.
export const clickAppMenuItem = (app, label) =>
  app.evaluate(({ Menu }, wanted) => {
    const find = (items) => {
      for (const item of items) {
        if (item.label === wanted) return item
        const hit = item.submenu && find(item.submenu.items)
        if (hit) return hit
      }
      return null
    }
    const item = find(Menu.getApplicationMenu().items)
    if (!item) throw new Error(`application menu item not found: ${wanted}`)
    item.click()
  }, label)

// Open Settings through the same path a user takes: the in-app File menu.
export async function openSettings(page) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Settings', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
}

// The four display toggles live behind the toolbar's View button, so anything
// driving one opens the panel first. Idempotent — the panel stays open across a
// toggle, so a test flipping two in a row calls this once.
export async function openViewMenu(page) {
  const panel = page.getByRole('group', { name: 'View' })
  if (await panel.isVisible()) return panel
  // Scoped to `.toolbar`, because the in-app MenuBar has a "View" menu of its
  // own on Windows/Linux — unscoped this is a strict-mode violation in the
  // container and passes only on the Mac, where MenuBar does not render.
  //
  // And NOT `{ name: 'View', exact: true }`: the count chip is inside the
  // button, so the accessible name is "View 1" the moment an option is off its
  // default — the state a grid or diagram comparison OPENS in.
  await page
    .locator('.toolbar')
    .getByRole('button', { name: /^View\b/ })
    .click()
  await expect(panel).toBeVisible()
  return panel
}

export async function closeViewMenu(page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: 'View' })).toBeHidden()
}

// Open, flip one option, close. The close is not tidiness: the panel carries a
// full-window backdrop, so a test that leaves it open has its NEXT click land on
// that backdrop instead of on what it aimed at.
export async function setViewOption(page, name, on = true) {
  const panel = await openViewMenu(page)
  const box = panel.getByRole('checkbox', { name })
  await (on ? box.check() : box.uncheck())
  await closeViewMenu(page)
}

// Navigate the in-app menu bar (Windows/Linux — the Docker env is Linux). Pass a
// leaf item under a top menu, or a submenu + leaf for the nested Tools/Security
// groups. Targets by structural class + text so kbd hints in the label don't
// interfere. Only the open dropdown/flyout is in the DOM, so text is unambiguous.
//
// Scoped to the menu bar, NOT the page: the sidebar's section filter carries a
// pill for every section, so a page-wide "Tools" (or "Snippets") matches two
// buttons and every one of these calls dies on a strict-mode violation.
export async function openMenu(page, top, sub, leaf) {
  await page.locator('.menubar').getByRole('button', { name: top, exact: true }).click()
  if (leaf) {
    // The submenu opens its flyout on hover; clicking the toggle would fire
    // mouseenter (opens) then the click handler (toggles shut), so hover only.
    await page.locator('.submenu', { hasText: sub }).hover()
    await page.locator('.flyout .item', { hasText: leaf }).click()
  } else {
    await page.locator('.dropdown .item', { hasText: sub }).click()
  }
}

// Answer a confirm dialog in MAIN. Some handlers ask before doing something
// outside the app (installing a PATH shim, rewriting ~/.gitconfig); a spec that
// drives them has to say which button the user pressed.
export async function stubMessageBox(app, response = 1) {
  await app.evaluate(({ dialog }, r) => {
    dialog.showMessageBox = async () => ({ response: r })
  }, response)
}

// Replace the native save/open dialogs in the MAIN process so file flows are
// deterministic (no un-driveable OS dialog). The handlers call dialog.show*Dialog
// at invoke time, so reassigning the property takes effect immediately.
export async function stubSaveDialog(app, filePath) {
  await app.evaluate(({ dialog }, fp) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp })
  }, filePath)
}
export async function stubOpenDialog(app, filePaths) {
  const list = Array.isArray(filePaths) ? filePaths : [filePaths]
  await app.evaluate(({ dialog }, fps) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: fps })
  }, list)
}

export { expect }
