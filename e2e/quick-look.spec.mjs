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

// The launcher tokenizes with Prism because it cannot carry Monaco, and paints
// the runs with the shared --syn-* roles. Those class RULES lived in a scoped
// stylesheet belonging to another component, so the spans rendered and matched
// nothing: every preview here was monochrome. The seeded examples are mermaid
// and claude, neither of which Prism has a grammar for, so this brings its own.
test('paints the preview with the syntax roles it tokenizes', async ({ app, page }) => {
  await seededReady(page)
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Highlight probe')
  await editor.locator('.lang-picker select').selectOption('json')
  await editor.locator('.editor').click()
  await page.keyboard.type('{ "keep": true, "count": 42 }')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await page.keyboard.press('Escape')

  const ql = await summon(app, page)
  await ql.locator('.ql-input').fill('Highlight probe')
  const roled = ql.locator('.ql-pv-body [class*="syn-"]').first()
  await expect(roled).toBeVisible()
  const [ink, plain] = await Promise.all([
    roled.evaluate((el) => getComputedStyle(el).color),
    ql.locator('.ql-pv-body').evaluate((el) => getComputedStyle(el).color)
  ])
  expect(ink).not.toBe(plain)
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

// Creating a snippet without raising the app: the + panel writes through the
// store's real encrypt path, and the name is sentence-cased on the way in.
test('the + button creates a plaintext snippet under a sentence-cased name', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)
  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()

  await ql.locator('.ql-compose-name').fill('deploy checklist')
  await ql.locator('.ql-compose-text').fill('1. build\n2. ship')
  await ql.locator('.ql-compose .btn-primary').click()

  // Panel closes and the new snippet is in the library, capitalized.
  await expect(ql.locator('.ql-compose')).toBeHidden()
  await ql.locator('.ql-input').fill('Deploy')
  await expect(ql.locator('.ql-res', { hasText: 'Deploy checklist' })).toBeVisible()
  // Plaintext carries no language chip, which is how it reads as plain.
  await expect(ql.locator('.ql-pv-lang')).toHaveCount(0)

  // It really round-trips through the vault, not just the in-memory list.
  await ql.keyboard.press('ArrowRight')
  await expect(ql.locator('.ql-pv-body')).toContainText('1. build')
})

// Reading or composing a snippet gives the whole width to the right pane. The
// grid track animates, so assert the measurable end states plus the fact that a
// transition is declared — a jump-cut would still pass the width checks alone.
test('the list collapses for compose and preview, and comes back', async ({ app, page }) => {
  const ql = await summon(app, page)
  const width = () =>
    ql.locator('.ql-results').evaluate((el) => Math.round(el.getBoundingClientRect().width))

  const declared = await ql
    .locator('.ql-body')
    .evaluate((el) => getComputedStyle(el).transitionProperty)
  expect(declared).toContain('grid-template-columns')

  const open = await width()
  expect(open).toBeGreaterThan(100)

  await ql.locator('.ql-add').click()
  await expect.poll(width, { timeout: 4000 }).toBeLessThan(5)
  await ql.keyboard.press('Escape')
  await expect.poll(width, { timeout: 4000 }).toBe(open)

  await ql.locator('.ql-input').fill('Mermaid')
  await expect(ql.locator('.ql-res', { hasText: EXAMPLE })).toBeVisible()
  await ql.keyboard.press('ArrowRight')
  await expect.poll(width, { timeout: 4000 }).toBeLessThan(5)
  await ql.keyboard.press('ArrowLeft')
  await expect.poll(width, { timeout: 4000 }).toBe(open)
})

// The card is deliberately flat: no rim, no drop shadow. Its own background is
// the only thing separating it from the desktop, so the gutter that used to hold
// a shadow is gone too and the card fills the window.
test('the launcher card is flat, with no rim or halo', async ({ app, page }) => {
  const ql = await summon(app, page)
  const box = await ql.locator('.ql').evaluate((el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      border: cs.borderTopWidth,
      shadow: cs.boxShadow,
      gutter: Math.round(window.innerHeight - r.bottom) + Math.round(r.left)
    }
  })
  expect(box.border).toBe('0px')
  expect(box.shadow).toBe('none')
  expect(box.gutter, 'no leftover gutter once nothing renders into it').toBe(0)
})

// The search box must never be live while something else owns the launcher —
// a tool panel, the new-snippet panel, or a snippet being read. Each disables it
// a different way, so all three are pinned here.
test('the search box is dead whenever a panel or preview owns the launcher', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)
  const input = ql.locator('.ql-input')

  // 1. A tool panel replaces the whole launcher, search band included.
  await input.fill('epoch')
  await ql.keyboard.press('Enter')
  await expect(ql.locator('.qc')).toBeVisible()
  await expect(input).toBeHidden()
  await ql.locator('.qc-back').click()
  await expect(input).toBeVisible()

  // 2. The new-snippet panel rolls the band away entirely.
  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(input).toBeHidden()
  await ql.keyboard.press('Escape')
  await expect(input).toBeVisible()

  // 3. Reading a snippet keeps the box focused (the arrow driver needs it) but
  //    read-only, so a stray keystroke cannot refilter the list underneath.
  await input.fill('Mermaid')
  await expect(ql.locator('.ql-res', { hasText: EXAMPLE })).toBeVisible()
  await ql.keyboard.press('ArrowRight')
  await expect(ql.locator('.ql-body')).toHaveClass(/in-preview/)
  await expect(input).toHaveAttribute('readonly', '')
  await ql.keyboard.press('z')
  await expect(input).toHaveValue('Mermaid')

  await ql.keyboard.press('ArrowLeft')
  await expect(input).not.toHaveAttribute('readonly', '')
})

// The loop the launcher exists for: capture something unnamed, then rename and
// correct it without ever raising the main window.
test('an unnamed snippet can be created and then edited in place', async ({ app, page }) => {
  const ql = await summon(app, page)

  await ql.locator('.ql-add').click()
  // Typing starts in the body — the name is optional, so it is not the gate.
  await expect(ql.locator('.ql-compose-text')).toBeFocused()
  await ql.locator('.ql-compose-text').fill('token=abc123')
  await ql.locator('.ql-compose .btn-primary').click()
  await expect(ql.locator('.ql-compose')).toBeHidden()

  // Unnamed snippets are stamped, so a pile of them stays tellable apart.
  const row = ql.locator('.ql-res', { hasText: 'Untitled' }).first()
  await expect(row).toBeVisible()
  await expect(row).toContainText(/Untitled \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  await row.click()

  // Edit it right here rather than being bounced to the main window.
  await ql.locator('.ql-pv-head button', { hasText: 'Edit' }).click()
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-compose-title')).toHaveText('Edit snippet')
  await expect(ql.locator('.ql-compose-text')).toHaveValue('token=abc123')

  await ql.locator('.ql-compose-name').fill('auth token')
  await ql.locator('.ql-compose .btn-primary').click()
  await expect(ql.locator('.ql-compose')).toBeHidden()

  // Renamed in place — sentence-cased, and no second copy left behind.
  await expect(ql.locator('.ql-res', { hasText: 'Auth token' })).toHaveCount(1)
  await expect(ql.locator('.ql-res', { hasText: 'Untitled' })).toHaveCount(0)
})

// Selecting a tool swaps in its panel; that swap is animated too.
//
// Sampled AT THE MOMENT Vue applies its enter class, for two reasons that both
// made the older assertion intermittent:
//   - Vue removes .ql-panel-enter-active on transitionend, and getComputedStyle
//     then reports the initial `all` — so reading it afterwards raced a 180ms
//     window and lost whenever the assertion arrived late.
//   - Vue swaps enter-from → enter-to on a requestAnimationFrame, and the
//     launcher is a separate always-on-top window: under Xvfb it can go
//     uncomposited, rAF never fires, and the transition does not RUN at all.
//     (Observed directly: the class is applied, then no enter-to and no
//     transition events.) So waiting on a transition event is not reliable
//     either — the class and what it declares are.
test('choosing a tool eases its panel in rather than cutting to it', async ({ app, page }) => {
  const ql = await summon(app, page)
  await ql.locator('.ql-input').fill('epoch')

  await ql.evaluate(() => {
    window.__eased = null
    const sample = (el) => {
      if (
        !window.__eased &&
        el instanceof Element &&
        el.classList.contains('qc') &&
        el.classList.contains('ql-panel-enter-active')
      ) {
        window.__eased = getComputedStyle(el).transitionProperty
      }
    }
    new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach(sample)
        if (r.type === 'attributes') sample(r.target)
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    })
  })

  await ql.keyboard.press('Enter')
  await expect(ql.locator('.qc')).toBeVisible()

  await expect.poll(() => ql.evaluate(() => window.__eased)).toMatch(/opacity|transform/)
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

// The launcher's keyboard model assumes the search box holds focus — onKeydown
// is bound to it. So ANY control that takes focus kills arrow navigation, which
// is what clicking the preview's back arrow did. Asserted through the visible
// consequence (the selection stops moving), not through document.activeElement.
test('arrow keys still work after clicking a launcher button', async ({ app, page }) => {
  await seededReady(page)
  const ql = await summon(app, page)
  await ql.locator('.ql-input').fill('Example')
  await expect(ql.locator('.ql-res').first()).toBeVisible()
  const count = await ql.locator('.ql-res').count()
  expect(count, 'needs two results for ArrowDown to have somewhere to go').toBeGreaterThan(1)
  const selectedName = () => ql.locator('.ql-res.sel').first().innerText()

  await ql.keyboard.press('ArrowRight') // into the preview zone
  await expect(ql.locator('.ql-pv-back')).toBeVisible()
  const before = await selectedName()

  await ql.locator('.ql-pv-back').click() // mouse click parks focus on the button
  await ql.keyboard.press('ArrowDown')

  await expect
    .poll(selectedName, { message: 'ArrowDown after a button click must still move the selection' })
    .not.toBe(before)
})
