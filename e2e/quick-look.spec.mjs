import { test, expect, openNewSnippet, docActions } from './fixtures.mjs'

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

// The seeded examples are mermaid and claude, which open in the main window.
async function saveJsonSnippet(page, name) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor
    .locator('.editor-status')
    .getByRole('combobox', { name: 'Syntax' })
    .selectOption('json')
  await editor.locator('.editor').click()
  await page.keyboard.type('{ "keep": true, "count": 42 }')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await page.keyboard.press('Escape')
}

test('summons the launcher with the seeded snippet', async ({ app, page }) => {
  await seededReady(page)
  const ql = await summon(app, page)

  // Filter to the Mermaid example so the test is independent of how many
  // snippets are seeded / their order (the top result is auto-selected).
  await ql.locator('.ql-input').fill('Mermaid')
  await expect(ql.locator('.ql-res.sel', { hasText: EXAMPLE })).toBeVisible()
  await expect(ql.locator('.ql-preview')).toHaveCount(0)
})

// The launcher tokenizes with Prism because it cannot carry Monaco, and paints
// the runs with the shared --syn-* roles.
test('paints the editor sheet with the syntax roles it tokenizes', async ({ app, page }) => {
  await seededReady(page)
  await saveJsonSnippet(page, 'Highlight probe')

  const ql = await summon(app, page)
  await ql.locator('.ql-input').fill('Highlight probe')
  await ql.keyboard.press('Enter')
  const roled = ql.locator('.ql-compose-hl [class*="syn-"]').first()
  await expect(roled).toBeVisible()
  const [ink, plain] = await Promise.all([
    roled.evaluate((el) => getComputedStyle(el).color),
    ql.locator('.ql-compose-hl').evaluate((el) => getComputedStyle(el).color)
  ])
  expect(ink).not.toBe(plain)
})

test('Enter opens a snippet in the sheet, and the ← button goes back', async ({ app, page }) => {
  await seededReady(page)
  await saveJsonSnippet(page, 'Sheet probe')
  const ql = await summon(app, page)

  await ql.locator('.ql-input').fill('Sheet probe')
  await ql.keyboard.press('Enter')
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-compose-name')).toHaveValue('Sheet probe')

  await ql.locator('.ql-compose-back').click()
  await expect(ql.locator('.ql-compose')).toBeHidden()
  await expect(ql.locator('.ql-input')).toHaveValue('Sheet probe')
})

test('copying names the snippet, flashes on its row, then closes', async ({ app, page }) => {
  await seededReady(page)
  const ql = await summon(app, page)

  await ql.locator('.ql-input').fill('Mermaid')
  await expect(ql.locator('.ql-res.sel', { hasText: EXAMPLE })).toBeVisible()
  await ql.keyboard.press('Control+c')

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

test('Escape closes the launcher from the sheet; ← never closes it', async ({ app, page }) => {
  const ql = await summon(app, page)
  const hidden = () =>
    app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) =>
        x.webContents.getURL().includes('quicklook')
      )
      return w ? !w.isVisible() : true
    })

  await ql.locator('.ql-input').fill('me')
  for (let i = 0; i < 4; i++) await ql.keyboard.press('ArrowLeft')
  await expect.poll(hidden, { timeout: 2000 }).toBe(false)

  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await ql.keyboard.press('Escape')
  await expect.poll(hidden, { timeout: 6000 }).toBe(true)
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

  // It really round-trips through the vault, not just the in-memory list.
  await ql.keyboard.press('Enter')
  await expect(ql.locator('.ql-compose-text')).toHaveValue('1. build\n2. ship')
})

test('the sheet takes the whole card at the same size, and gives it back', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)
  const bounds = () =>
    app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) =>
        x.webContents.getURL().includes('quicklook')
      )
      const { width, height } = w.getBounds()
      return { width, height }
    })
  const resting = await bounds()

  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-results')).toBeHidden()
  await expect(ql.locator('.ql-search')).toBeHidden()
  expect(await bounds()).toEqual(resting)

  await ql.locator('.ql-compose-back').click()
  await expect(ql.locator('.ql-results')).toBeVisible()
  expect(await bounds()).toEqual(resting)
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

const appRegion = (locator) =>
  locator.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))

// The widest uninterrupted run of a band a pointer can actually grab — every
// no-drag control is a hole punched in it. A handle its controls have grown
// across is a handle in name only.
const widestGrab = (locator) =>
  locator.evaluate((band) => {
    const box = band.getBoundingClientRect()
    const holes = [...band.querySelectorAll('*')]
      .filter((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region') === 'no-drag')
      .map((el) => el.getBoundingClientRect())
      .sort((a, b) => a.left - b.left)
    let widest = 0
    let cursor = box.left
    for (const hole of [...holes, { left: box.right, right: box.right }]) {
      widest = Math.max(widest, hole.left - cursor)
      cursor = Math.max(cursor, hole.right)
    }
    return Math.round(widest)
  })

const launcherState = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) =>
      x.webContents.getURL().includes('quicklook')
    )
    return { movable: w.isMovable(), visible: w.isVisible(), x: w.getBounds().x }
  })

const moveLauncherBy = (app, dx) =>
  app.evaluate(({ BrowserWindow }, by) => {
    const w = BrowserWindow.getAllWindows().find((x) =>
      x.webContents.getURL().includes('quicklook')
    )
    const b = w.getBounds()
    w.setPosition(b.x + by, b.y)
  }, dx)

const blurLauncher = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((x) => x.webContents.getURL().includes('quicklook'))
      .emit('blur')
  })

// The launcher is frameless, so the only thing that can move it is a drag band —
// and the OS does the moving, which needs `movable` on the window AS WELL AS the
// CSS. Both halves are pinned here, and so is the trap that arrives with them: a
// drag band takes the pointer for everything inside it that has not opted back
// out, so the search box, the + and the language picker would go dead while
// still looking live.
test('the launcher moves by its chrome bands without deadening their controls', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)

  expect(
    (await launcherState(app)).movable,
    'a drag band cannot move a window the OS refuses to move'
  ).toBe(true)

  expect(await appRegion(ql.locator('.ql-search'))).toBe('drag')
  expect(await appRegion(ql.locator('.ql-input'))).toBe('no-drag')
  expect(await appRegion(ql.locator('.ql-add'))).toBe('no-drag')

  // The controls in those bands still do their jobs — typed into, clicked,
  // chosen from — which is what the no-drag rule buys.
  await ql.locator('.ql-input').fill('Dragged')
  await expect(ql.locator('.ql-input')).toHaveValue('Dragged')
  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()

  expect(await appRegion(ql.locator('.ql-compose-head'))).toBe('drag')
  expect(await appRegion(ql.locator('.ql-compose-foot'))).toBe('drag')
  expect(await appRegion(ql.locator('.ql-compose-lang'))).toBe('no-drag')
  // The case this was built for: moving the card aside while writing a snippet.
  // The footer carries only the language, so it is the handle that is always there.
  expect(await widestGrab(ql.locator('.ql-compose-foot'))).toBeGreaterThan(400)
  await ql.locator('.ql-compose-lang').selectOption('sql')
  await expect(ql.locator('.ql-compose-lang')).toHaveValue('sql')

  // A moved card must keep the Spotlight dismissal the launcher is built on.
  // The blur is emitted rather than provoked by focusing something else: a
  // hidden window on a virtual display does not hand focus over on demand, so
  // what is asserted is the wiring `movable` now sits beside, not the OS.
  const before = (await launcherState(app)).x
  await moveLauncherBy(app, 40)
  expect((await launcherState(app)).x).toBe(before + 40)
  await blurLauncher(app)
  await expect.poll(async () => (await launcherState(app)).visible, { timeout: 6000 }).toBe(false)
})

// The search box must never be live while something else owns the launcher —
// a tool panel or the editor sheet. Both take it away entirely.
test('the search box is gone whenever a panel or the sheet owns the launcher', async ({
  app,
  page
}) => {
  const ql = await summon(app, page)
  const input = ql.locator('.ql-input')

  await input.fill('epoch')
  await ql.keyboard.press('Enter')
  await expect(ql.locator('.qc')).toBeVisible()
  await expect(input).toBeHidden()
  await ql.locator('.qc-back').click()
  await expect(input).toBeVisible()

  await ql.locator('.ql-add').click()
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(input).toBeHidden()
  await ql.locator('.ql-compose-back').click()
  await expect(input).toBeVisible()
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
  await ql.locator('.ql-input').fill('Untitled')
  await ql.keyboard.press('Enter')
  await expect(ql.locator('.ql-compose')).toBeVisible()
  await expect(ql.locator('.ql-compose-name')).toHaveValue(/Untitled/)
  await expect(ql.locator('.ql-compose-text')).toHaveValue('token=abc123')

  await ql.locator('.ql-compose-name').fill('auth token')
  await ql.locator('.ql-compose .btn-primary').click()
  await expect(ql.locator('.ql-compose')).toBeHidden()

  // Renamed in place — sentence-cased, and no second copy left behind. Counted
  // on the WHOLE list, so the search that selected it cannot flatter the result.
  await ql.locator('.ql-input').fill('')
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
// is what clicking a back arrow did. Asserted through the visible consequence
// (the selection stops moving), not through document.activeElement.
test('arrow keys still work after clicking a launcher button', async ({ app, page }) => {
  await seededReady(page)
  const ql = await summon(app, page)
  await ql.locator('.ql-input').fill('epoch')
  await ql.keyboard.press('Enter')
  await expect(ql.locator('.qc')).toBeVisible()

  await ql.locator('.qc-back').click() // mouse click parks focus on the button
  await ql.locator('.ql-input').fill('Example')
  await expect(ql.locator('.ql-res').nth(1)).toBeVisible()
  const selectedName = () => ql.locator('.ql-res.sel').first().innerText()
  const before = await selectedName()
  await ql.keyboard.press('ArrowDown')

  await expect
    .poll(selectedName, { message: 'ArrowDown after a button click must still move the selection' })
    .not.toBe(before)
})
