import { test, expect, clickAppMenuItem } from './fixtures.mjs'

// Real windows, not the hidden ones a macOS host run defaults to: this spec
// closes the last window and summons the app back from having none.
process.env.E2E_HIDDEN = '0'

// macOS keeps the app running after its last window closes, so DiffBro can sit
// frontmost with nothing on screen — the state behind "the menu bar says Diff
// Bro but the window never comes up". The warm launcher makes it a dead end:
// rebuilt by the next shortcut press, it holds the window count above zero, so
// a count-based "any windows left?" check never reopens the main window.
//
// Windows/Linux quit on window-all-closed, so the state cannot exist there and
// these skip. Run them on a Mac with:
//   env -u ELECTRON_RUN_AS_NODE npx playwright test e2e/quick-look-window-recovery.spec.mjs
test.skip(process.platform !== 'darwin', 'macOS-only: elsewhere the app quits with its last window')

const EXAMPLE = 'Example — Mermaid diagram'

const windows = (app) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({
      quickLook: w.webContents.getURL().includes('quicklook'),
      visible: w.isVisible()
    }))
  )

const mainIsBack = async (app) => (await windows(app)).some((w) => !w.quickLook && w.visible)

// Closing the main window also tears down the warm launcher (its 'closed' hook),
// so this leaves the app running with no windows at all.
const closeMainWindow = (app) =>
  app.evaluate(
    ({ BrowserWindow }) =>
      new Promise((res) => {
        const main = BrowserWindow.getAllWindows().find(
          (w) => !w.webContents.getURL().includes('quicklook')
        )
        main.once('closed', () => setTimeout(res, 400))
        main.close()
      })
  )

// No window means no renderer to call window.api, so summon through the View ▸
// Quick Look-up item — the menu bar is the only UI macOS still shows here, and
// it shares toggleQuickLook() with the global shortcut.
async function launcherAlone(app) {
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    clickAppMenuItem(app, 'Quick Look-up')
  ])
  await ql.waitForLoadState('domcontentloaded')
  expect(await windows(app)).toEqual([{ quickLook: true, visible: true }])
  return ql
}

test('dock activation reopens the main window when only the warm launcher is left', async ({
  app,
  page
}) => {
  await expect(page.getByText(EXAMPLE)).toBeVisible()
  await closeMainWindow(app)
  expect(await windows(app)).toEqual([])

  await launcherAlone(app)

  // What a Dock click sends; Playwright cannot click the Dock itself.
  await app.evaluate(({ app: a }) => a.emit('activate'))

  await expect.poll(() => mainIsBack(app), { timeout: 10_000 }).toBe(true)
})

test('choosing a launcher result reopens the main window and still delivers it', async ({
  app,
  page
}) => {
  await expect(page.getByText(EXAMPLE)).toBeVisible()
  await closeMainWindow(app)

  const ql = await launcherAlone(app)
  await expect(ql.locator('.ql-input')).toBeVisible()
  await ql.locator('.ql-input').fill('Mermaid')
  await expect(ql.locator('.ql-res', { hasText: EXAMPLE })).toBeVisible()

  const [main] = await Promise.all([app.waitForEvent('window'), ql.keyboard.press('Enter')])
  await main.waitForLoadState('domcontentloaded')

  // The payload arrives only because openInMain defers the send to
  // did-finish-load: a window created for this choice has no listener yet.
  await expect(main.getByRole('dialog')).toBeVisible()
})
