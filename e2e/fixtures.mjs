import { test as base, _electron as electron, expect } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
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
// A macOS host run starts every window with `show: false` (the flag a tray
// launch already used), so it does not flash windows across the screen for
// twelve minutes. Chromium still renders offscreen, so visibility and geometry
// assertions are unchanged. `E2E_HIDDEN=0` opts out — the window-recovery spec
// needs real ones. Linux runs under Xvfb and has nothing to hide from.
const hidden = () =>
  process.platform === 'darwin' && process.env.E2E_HIDDEN !== '0' ? ['--hidden'] : []
export const launchApp = (userDataDir, options = {}) =>
  electron.launch({
    args: [MAIN, `--user-data-dir=${userDataDir}`, ...hidden()],
    env: workerEnv(userDataDir),
    ...options
  })

// The first window, loaded and ready to assert against.
export async function firstReadyPage(app) {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // The menu helpers need the Electron app to drive the NATIVE bar on macOS,
  // and every one of them is called with only the page. Set HERE and not in the
  // `page` fixture, for the same reason TMPDIR/HOME are: the relaunch specs
  // call launchApp + firstReadyPage directly and never touch the fixture.
  page.electronApp = app
  return page
}

// Fixtures for the common case: one fresh app + its window, torn down (and the
// temp profile removed) after the test.
export const test = base.extend({
  // Per-file: `test.use({ tips: true })` launches with the onboarding tour armed.
  tips: [false, { option: true }],
  userDataDir: async ({ tips }, use) => {
    const dir = freshUserDataDir({ tips })
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },
  app: async ({ userDataDir }, use) => {
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
    // Exact first, then substring — the in-window path matches with `hasText`,
    // and the two must agree or a caller has to know which platform it is on.
    // The native labels are the longer ones ("Epoch / Date" for "Epoch").
    const findAll = (items, match) =>
      items.flatMap((item) => [
        ...(match(item.label) ? [item] : []),
        ...(item.submenu ? findAll(item.submenu.items, match) : [])
      ])
    const all = Menu.getApplicationMenu().items
    const exact = findAll(all, (l) => l === wanted)
    // A substring match that hits twice is a coin toss, and a silently wrong
    // click is worse than a failure: say so instead.
    const loose = exact.length ? exact : findAll(all, (l) => l?.includes?.(wanted))
    if (loose.length > 1) {
      throw new Error(`ambiguous application menu item "${wanted}": ${loose.map((i) => i.label)}`)
    }
    if (!loose.length) throw new Error(`application menu item not found: ${wanted}`)
    loose[0].click()
  }, label)

// macOS renders no in-window menu bar — App.vue mounts MenuBar only when
// !isMac, because the platform already owns one. Every helper below therefore
// has TWO paths, and for a long time only the Linux one existed: 62 specs
// failed on a developer Mac for no reason anyone had looked into.
const usesNativeMenu = () => process.platform === 'darwin'

// Open Settings through the same path a user takes: the File menu.
export async function openSettings(page) {
  if (usesNativeMenu()) {
    await clickAppMenuItem(page.electronApp, 'Settings')
  } else {
    await openMenu(page, 'File', 'Settings…')
  }
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
}

// Settings edits are a draft: Save writes them and the dialog then closes
// without asking. Found by role-free locators, so it works in any locale.
export async function saveSettings(page) {
  const panel = page.locator('[data-tour="settings"]')
  const save = panel.locator(':scope > .dialog-actions .btn-primary')
  if (await save.isEnabled()) await save.click()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
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
  // The native bar is addressed by leaf label, so the path through it needs no
  // knowledge of which top menu or submenu the item lives under.
  if (usesNativeMenu()) return clickAppMenuItem(page.electronApp, leaf ?? sub)
  // Flyouts open on hover; clicking a toggle would fire mouseenter (opens) then
  // the click handler (toggles shut), so every level but the last is hovered.
  await page.locator('.menubar').getByRole('button', { name: 'Menu', exact: true }).click()
  await page.locator('.menubar > .dropdown > .submenu > .item', { hasText: top }).hover()
  const menu = page.locator('.menubar > .dropdown > .submenu > .flyout')
  if (leaf) {
    await menu.locator(':scope > .submenu > .item', { hasText: sub }).hover()
    await menu.locator('.flyout .item', { hasText: leaf }).click()
  } else {
    await menu.locator(':scope > .item', { hasText: sub }).click()
  }
}

// Playwright's link to Electron main drops its context under suite load; these stubs are idempotent.
async function evaluateInMain(app, fn, arg) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await app.evaluate(fn, arg)
    } catch (err) {
      if (attempt >= 3 || !/Execution context was destroyed/.test(err.message)) throw err
    }
  }
}

// Answer a confirm dialog in MAIN. Some handlers ask before doing something
// outside the app (installing a PATH shim, rewriting ~/.gitconfig); a spec that
// drives them has to say which button the user pressed.
export async function stubMessageBox(app, response = 1) {
  await evaluateInMain(
    app,
    ({ dialog }, r) => {
      dialog.showMessageBox = async () => ({ response: r })
    },
    response
  )
}

// Replace the native save/open dialogs in the MAIN process so file flows are
// deterministic (no un-driveable OS dialog). The handlers call dialog.show*Dialog
// at invoke time, so reassigning the property takes effect immediately.
export async function stubSaveDialog(app, filePath) {
  await evaluateInMain(
    app,
    ({ dialog }, fp) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: fp })
    },
    filePath
  )
}
export async function stubOpenDialog(app, filePaths) {
  const list = Array.isArray(filePaths) ? filePaths : [filePaths]
  await evaluateInMain(
    app,
    ({ dialog }, fps) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: fps })
    },
    list
  )
}

export const paneLabel = (page, side) => page.locator(`.pane-label[data-side="${side}"]`)

export async function pickSide(app, side, filePath) {
  await stubOpenDialog(app, filePath)
  await clickAppMenuItem(app, side === 'left' ? 'Open Left' : 'Open Right')
}

export async function openSide(app, page, side, filePath) {
  await pickSide(app, side, filePath)
  await expect(paneLabel(page, side)).toHaveText(basename([filePath].flat()[0]))
}

export { expect }

// The sidebar's New-snippet control. NOT getByRole('button', { name: 'New
// snippet' }): the Snippets section renders an empty-state CTA with the same
// accessible name while the seeded examples are still being encrypted, so that
// locator is a strict-mode violation waiting for a slow enough machine — it
// took until a CI runner to fire.
export const newSnippetButton = (page) => page.locator('[data-tour="snippet-new"]')

// Keys has no segment (#144): it is reached from Security ▸ Trusted Keys.
export async function showPanel(page, panel) {
  if (panel === 'keys') {
    if (await page.locator('.usb-panel[data-panel="keys"]').isVisible()) return
    return openMenu(page, 'Security', 'Trusted Keys', 'Manage Trusted Keys…')
  }
  const show = page.getByRole('button', { name: 'Show the sidebar' })
  if (await show.count()) {
    await page.locator('.sidebar-strip').hover()
    await show.click()
  }
  const item = page.locator(`.sidebar-nav [data-value="${panel}"]`)
  if ((await item.getAttribute('aria-pressed')) !== 'true') await item.click()
}

// The # scope in the sidebar search (#121): picking the scoped tag again clears it.
export async function pickTag(page, name) {
  const chip = page.locator('.usb-top .scope-chip')
  if ((await chip.count()) && (await chip.locator('.scope-text').innerText()) === name) {
    return chip.getByRole('button').click()
  }
  const box = page.locator('.usb-top input[type="search"]')
  await box.fill(`#${name}`)
  await page.locator('.usb-top .scope-list li', { hasText: new RegExp(`^${name}$`) }).click()
  await expect(chip.locator('.scope-text')).toHaveText(name)
}

export const docActions = (page) => page.locator('#toolbar-doc-actions')

export const snippetMoreMenu = (page) =>
  docActions(page).getByRole('button', { name: 'More snippet actions' })

// Secret lives in the row's right-click menu, so a snippet is saved before it is marked.
export async function markSecret(page, name, on = true) {
  await page.locator('.snippets-section .row', { hasText: name }).first().click({ button: 'right' })
  const item = page.getByRole('menuitemcheckbox', { name: 'Secret' })
  await expect(item).toHaveAttribute('aria-checked', String(!on))
  await item.click()
  await expect(item).toHaveCount(0)
}

// It re-titles itself (New / Edit / Snippet); only the active tab's is visible.
export const snippetDoc = (page) => page.locator('.snippet-doc:visible')

// No Close button any more: a snippet is closed like any tab.
export async function closeSnippet(page) {
  await page.locator('.diff-tabs .tab.active .tab-close').click()
  await expect(snippetDoc(page)).toHaveCount(0)
}

// No Edit button any more: a press on the content starts editing in place.
export async function editInPlace(page) {
  const doc = snippetDoc(page)
  await doc.locator('.editor-area').click({ position: { x: 90, y: 14 } })
  await expect(page.getByRole('region', { name: 'Edit snippet' })).toBeVisible()
  return doc
}

// Closing the tab is the one way to abandon a comparison; unsaved work asks first.
export async function closeComparison(page) {
  await page.locator('.diff-tabs .tab.active .tab-close').click()
  const confirm = page.getByRole('dialog', { name: 'Close comparison?' })
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByRole('button', { name: 'Close it' }).click()
  }
}

export async function openNewSnippet(page) {
  await showPanel(page, 'snippets')
  await newSnippetButton(page).click()
}
