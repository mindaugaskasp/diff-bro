import { test, expect, clickAppMenuItem } from './fixtures.mjs'

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

  // Filter to the Mermaid example so the test is independent of how many
  // snippets are seeded / their order (the top result is auto-selected).
  await ql.locator('.ql-input').fill('Mermaid')
  await expect(ql.locator('.ql-res', { hasText: EXAMPLE })).toBeVisible()
  await expect(ql.locator('.ql-pv-name')).toHaveText(EXAMPLE)
})

test('→ enters snippet-scroll mode and ← returns to the list', async ({ app, page }) => {
  await seededReady(page)
  const ql = await summon(app, page)

  await ql.locator('.ql-input').fill('Mermaid')
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

  await ql.locator('.ql-input').fill('Mermaid')
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

// Shift+Cmd+C copies just the highlighted preview line; the whole-snippet copy
// stays on Cmd+C. The active line steps with ↑/↓ (keyboard) and is marked .hot.
test('Shift+Cmd+C copies only the active preview line', async ({ app, page }) => {
  await seededReady(page)
  const ql = await summon(app, page)

  await ql.locator('.ql-input').fill('Mermaid')
  await ql.keyboard.press('ArrowRight') // enter preview; line 0 is active

  await expect(ql.locator('.ql-pv-line.hot')).toHaveCount(1)
  await ql.keyboard.press('ArrowDown') // step to line 2 (index 1)
  const active = ql.locator('.ql-pv-line').nth(1)
  await expect(active).toHaveClass(/hot/)
  const lineText = await active.textContent()

  await ql.keyboard.press('Shift+Control+c') // Linux env → Ctrl+Shift+C
  await expect(ql.locator('.ql-toast')).toContainText('line 2')

  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toBe(lineText)
})

// ← is exit navigation once there is nothing left to back out of, but the search
// box must keep the key while its caret can still move — otherwise editing a
// query slams the launcher shut mid-word.
test('← exits the launcher only once the caret has nowhere left to go', async ({ app, page }) => {
  const ql = await summon(app, page)
  const hidden = () =>
    app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) =>
        x.webContents.getURL().includes('quicklook')
      )
      return w ? !w.isVisible() : true
    })

  await ql.locator('.ql-input').fill('me') // caret sits at the end
  await ql.keyboard.press('ArrowLeft') // → caret 1
  await ql.keyboard.press('ArrowLeft') // → caret 0
  await expect.poll(hidden, { timeout: 2000 }).toBe(false)

  await ql.keyboard.press('ArrowLeft') // nowhere left to go: exit
  await expect.poll(hidden, { timeout: 6000 }).toBe(true)
})

// The footer must advertise ← as the way out, and must still fit: hints live in
// a fixed-height band with no wrap, so a chip too many pushes them out of sight
// rather than reflowing. Measured, not eyeballed — and in a dark theme too,
// since a theme may retune the type scale the band is sized against.
async function footerFitsIn(app, page, theme) {
  const ql = await summon(app, page)
  await expect(ql.locator('html')).toHaveAttribute('data-theme', theme)

  const foot = ql.locator('.ql-foot')
  const fits = () => foot.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)

  await expect(foot).toContainText('←/Esc')
  await expect(foot).toContainText('close')
  expect(await fits(), `footer overflows in ${theme}`).toBe(true)

  // Inside the expanded Tools section ← steps back out instead of closing, and
  // that longer label is the widest the band ever has to carry.
  await ql.keyboard.press('ArrowRight')
  await expect(foot).toContainText('collapse')
  expect(await fits(), `footer overflows in ${theme} with Tools open`).toBe(true)
}

test('the footer advertises ← as the exit and still fits the band', async ({ app, page }) => {
  await footerFitsIn(app, page, 'light')
})

test('the footer still fits once a dark theme retunes the tokens', async ({ app, page }) => {
  await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await footerFitsIn(app, page, 'dark')
})

// Arrowing past the visible rows must scroll the list; before this it stopped at
// the fold and the selection walked off-screen (the Tools section made the list
// long enough to notice).
test('arrowing down scrolls the results list to keep the selection visible', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)
  const list = ql.locator('.ql-results')
  const before = await list.evaluate((el) => el.scrollTop)

  // Tools leads the list, so → expands it straight away; then walk to the bottom.
  await expect(ql.locator('.ql-res.sel')).toContainText('Tools')
  await ql.keyboard.press('ArrowRight')
  for (let i = 0; i < 12; i++) await ql.keyboard.press('ArrowDown')

  await expect
    .poll(async () => {
      const el = await list.elementHandle()
      const { scrollTop, scrollHeight, clientHeight } = await el.evaluate((n) => ({
        scrollTop: n.scrollTop,
        scrollHeight: n.scrollHeight,
        clientHeight: n.clientHeight
      }))
      return scrollHeight > clientHeight ? scrollTop : -1
    })
    .toBeGreaterThan(before)
})
