import { test, expect } from './fixtures.mjs'

// The quick look-up is a SECOND BrowserWindow (quicklook.html), summoned by a
// global shortcut in real use. Global shortcuts and OS focus are unreliable
// under Xvfb, so we summon it the same way the menu does — through the
// `quicklook:toggle` IPC (window.api.quickLookToggle) — and drive the new
// window's DOM directly. DOM assertions hold even though the window is
// transparent / always-on-top / hides on blur, because Playwright reads the
// page, not the OS window.
const EXAMPLE = 'Example — Mermaid diagram'

// Summon the launcher and return its page, once its search box is up.
async function summon(app, page) {
  const [ql] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => window.api.quickLookToggle())
  ])
  await ql.waitForLoadState('domcontentloaded')
  await expect(ql.locator('.ql-input')).toBeVisible()
  return ql
}

// The seeded example snippet must have persisted from the main window before the
// launcher (a separate Pinia instance) re-reads the shared library.
async function seededReady(page) {
  await expect(page.getByText(EXAMPLE)).toBeVisible()
}

test('summons the launcher with the seeded snippet and previews it', async ({ app, page }) => {
  await seededReady(page)
  const ql = await summon(app, page)

  await expect(ql.locator('.ql-res', { hasText: EXAMPLE })).toBeVisible()
  // Index 0 is auto-selected, so its preview header names the same snippet.
  await expect(ql.locator('.ql-pv-name')).toHaveText(EXAMPLE)
})

test('→ enters snippet-scroll mode and ← returns to the list', async ({ app, page }) => {
  await seededReady(page)
  const ql = await summon(app, page)

  await ql.locator('.ql-input').focus()
  await ql.keyboard.press('ArrowRight')

  // The whole body flips to the parked/focused state and the footer hints swap.
  await expect(ql.locator('.ql-body')).toHaveClass(/in-preview/)
  await expect(ql.getByText('back to list')).toBeVisible()

  await ql.keyboard.press('ArrowLeft')
  await expect(ql.locator('.ql-body')).not.toHaveClass(/in-preview/)
  await expect(ql.getByText('scroll preview')).toBeVisible()
})

test('copying names the snippet, flashes on its row, then closes', async ({ app, page }) => {
  await seededReady(page)
  const ql = await summon(app, page)

  await ql.locator('.ql-pv-copy').click()

  // The confirmation names what was taken…
  await expect(ql.locator('.ql-toast')).toContainText(EXAMPLE)
  // …a "Copied" cue lands on that exact row…
  await expect(ql.locator('.ql-res.copied .ql-res-copied')).toBeVisible()

  // The real clipboard received the snippet body (copyText → main process).
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toContain('flowchart')

  // …and the launcher then dismisses itself (the window hides shortly after).
  await expect
    .poll(
      () =>
        app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find((x) =>
            x.webContents.getURL().includes('quicklook')
          )
          return w ? w.isVisible() : false
        }),
      { timeout: 6000 }
    )
    .toBe(false)
})
