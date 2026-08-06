import { rmSync } from 'node:fs'
import {
  test,
  expect,
  clickAppMenuItem,
  launchApp,
  freshUserDataDir,
  firstReadyPage
} from './fixtures.mjs'

// Mermaid's two themes are each drawn for their own ground, so pinning a diagram
// light while the app stays dark is only correct if the diagram brings its own
// paper with it. Both halves are measurable rendered properties — a computed
// background, and the resolved fill of the diagram's own label text — so nothing
// here is a screenshot. jsdom renders no SVG at all, which is why it lives here.

const PAPER_LIGHT = 'rgb(255, 255, 255)'

// Perceived lightness of the first label's resolved fill. Mermaid's dark theme
// writes light text and its default theme dark text, so this separates them
// without pinning either to an exact colour. Null while a re-render is in
// flight, when the fill can resolve to a keyword rather than a colour.
const inkLightness = (scope) =>
  scope
    .locator('.mermaid-diagram svg text')
    .first()
    .evaluate((el) => {
      const parts = getComputedStyle(el)
        .fill.match(/[\d.]+/g)
        ?.map(Number)
      if (!parts || parts.length < 3) return null
      return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]
    })

// Wait for the diagram to settle on ink that satisfies `ok` — composed into one
// boolean so a null mid-render is a retry, never a type error.
const inkSettles = (scope, ok) =>
  expect
    .poll(async () => {
      const ink = await inkLightness(scope)
      return ink !== null && ok(ink)
    })
    .toBe(true)

const themeButton = (scope, label) =>
  scope.getByRole('group', { name: 'Theme' }).getByRole('button', { name: label })

test('a diagram pins light while the app stays dark, and brings its own paper', async ({
  app,
  page
}) => {
  await clickAppMenuItem(app, 'Settings')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Use the Dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Escape')

  const row = page.getByText('Example — Mermaid diagram')
  await row.hover()
  await page.getByRole('button', { name: 'View diagram' }).click()
  const viewer = page.locator('.viewer-backdrop')
  await expect(viewer.locator('.mermaid-diagram svg').first()).toBeVisible()

  // Auto on a dark app: the diagram already agrees with the ground, so it asks
  // for no paper of its own and the app surface shows through.
  const host = viewer.locator('.mermaid-diagram .host')
  expect(await host.getAttribute('data-paper')).toBeNull()
  let darkInk = null
  await expect.poll(async () => (darkInk = await inkLightness(viewer))).not.toBeNull()

  await themeButton(viewer, 'Light').click()
  await expect(host).toHaveAttribute('data-paper', 'light')
  await expect(host).toHaveCSS('background-color', PAPER_LIGHT)

  // ...and it really re-rendered in Mermaid's light theme: the label ink went
  // dark. Without the paper this is the unreadable state the feature exists to
  // avoid — dark text on #0d1117.
  await inkSettles(viewer, (ink) => ink < darkInk / 2)

  // The paper exists so the diagram stays READABLE, which is the thing to
  // assert — not merely that a colour changed. Label ink against the sheet it
  // now sits on, in WCAG terms.
  const ratio = await host.evaluate((el) => {
    const rgb = (v) =>
      v
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
    const chan = (x) => (x / 255 <= 0.03928 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4)
    const lum = ([r, g, b]) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
    const ink = lum(rgb(getComputedStyle(el.querySelector('svg text')).fill))
    const paper = lum(rgb(getComputedStyle(el).backgroundColor))
    const [hi, lo] = [ink, paper].sort((a, b) => b - a)
    return (hi + 0.05) / (lo + 0.05)
  })
  expect(ratio).toBeGreaterThan(4.5)

  // It shares the toolbar row with the zoom controls, so its box has to match
  // theirs rather than growing out of its own padding.
  const heights = await viewer
    .locator('.head .tbtn, .head .seg')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2)

  // Back on Auto the app's own ground is right again, so the paper goes away.
  await themeButton(viewer, 'Auto').click()
  await expect.poll(() => host.getAttribute('data-paper')).toBeNull()
  await inkSettles(viewer, (ink) => ink > darkInk / 2)
})

// This test used to assert the opposite — that the choice survived a relaunch —
// on the reasoning that "a viewing preference that resets every launch is not a
// preference". That reasoning was wrong about what the control IS: it answers
// "show me THIS diagram on the other ground", and persisting it meant one look
// at one diagram re-themed every diagram afterwards, on every future launch.
// The stored setting remains the DEFAULT each viewing starts from (see the
// pinned-profile cases below, which pre-write settings.json); the control is now
// an override that dies with its dialog.
test('the editor preview theme does not outlive the editor', async () => {
  const userDataDir = freshUserDataDir()
  try {
    let app = await launchApp(userDataDir)
    let page = await firstReadyPage(app)

    await page.getByText('Example — Mermaid diagram').click()
    const editor = page.getByRole('dialog', { name: 'Snippet', exact: true })
    const host = editor.locator('.mmd-preview .mermaid-diagram .host')
    await expect(editor.locator('.mmd-preview .mermaid-diagram svg').first()).toBeVisible()

    // The app is on Light here, so pinning Dark is the mismatch this time.
    expect(await host.getAttribute('data-paper')).toBeNull()
    await themeButton(editor, 'Dark').click()
    await expect(host).toHaveAttribute('data-paper', 'dark')
    await app.close()

    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    await page.getByText('Example — Mermaid diagram').click()
    const reopened = page.getByRole('dialog', { name: 'Snippet', exact: true })
    await expect(reopened.locator('.mmd-preview .mermaid-diagram svg').first()).toBeVisible()
    // Back to Auto, which on a light app means no paper of its own.
    await expect
      .poll(() =>
        reopened.locator('.mmd-preview .mermaid-diagram .host').getAttribute('data-paper')
      )
      .toBeNull()
    await app.close()
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// Sample ink-vs-ground contrast continuously across a theme switch. The bug is a
// TRANSIENT: the paper flips with the preference while the diagram is still the
// one drawn for the old ground, so for a few frames light ink sits on a white
// sheet. Only a continuous probe can see it.
test('the diagram never sits on a ground it was not drawn for', async ({ app, page }) => {
  await clickAppMenuItem(app, 'Settings')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Use the Dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Escape')

  await page.getByText('Example — Mermaid diagram').click()
  const editor = page.getByRole('dialog', { name: 'Snippet', exact: true })
  const host = editor.locator('.mmd-preview .host')
  await expect(editor.locator('.mmd-preview .mermaid-diagram svg').first()).toBeVisible()
  // Auto on a dark app: dark diagram, no paper — the state the switch leaves.
  expect(await host.getAttribute('data-paper')).toBeNull()
  await page.waitForTimeout(400)

  await page.evaluate(() => {
    const lum = (v) => {
      const [r, g, b] = v
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
      const c = (x) => (x / 255 <= 0.03928 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4)
      return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
    }
    const groundOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor
        if (bg && !bg.includes('rgba(0, 0, 0, 0)')) return bg
      }
      return 'rgb(255, 255, 255)'
    }
    window.__worst = 99
    window.__probe = setInterval(() => {
      const el = document.querySelector('.mmd-preview .host')
      const text = el?.querySelector('svg text')
      if (!text) return
      const [hi, lo] = [lum(getComputedStyle(text).fill), lum(groundOf(el))].sort((a, b) => b - a)
      window.__worst = Math.min(window.__worst, (hi + 0.05) / (lo + 0.05))
    }, 8)
  })

  await themeButton(editor, 'Light').click()
  await expect(host).toHaveAttribute('data-paper', 'light')
  await page.waitForTimeout(1200)

  const worst = await page.evaluate(() => {
    clearInterval(window.__probe)
    return window.__worst
  })
  // Mermaid's themes clear 4.5 on their own ground; near 1 means the diagram was
  // briefly drawn against the other one.
  expect(worst).toBeGreaterThan(3)
})

// Mermaid's renderer is a 2.8 MB chunk kept out of the main bundle, so the first
// diagram of a session cost ~400ms of stopped app — measured, and reported as a
// freeze. It is pulled in at idle now, before anything asks for it.
test('the diagram renderer is ready before anything needs it', async ({ page }) => {
  // Nothing has rendered a diagram: no preview hovered, no viewer, no capture.
  expect(await page.locator('.mermaid-diagram').count()).toBe(0)

  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByName('mermaid-ready').length), {
      timeout: 15000
    })
    .toBe(1)

  // Still nothing rendered — the warm is what loaded it, not a render.
  expect(await page.locator('.mermaid-diagram').count()).toBe(0)
})

// The two "pinned profile" cases that stood here drove the diagram DIFF with a
// pre-written settings.json. That pin no longer exists: the ground is a
// per-viewing control on the viewer and the editor preview, and a diagram diff
// always follows the app. What they guarded — a pinned diagram staying readable
// on its own paper — is asserted by the first test in this file, which pins
// through the control a user actually has.

// The theme control is a per-VIEWING choice — "show me this one on light paper"
// — not a preference. It wrote straight to settings.setDiagramTheme, so pinning
// one diagram light re-themed every diagram you opened afterwards, and survived
// a relaunch. Closing the viewer must put it back.
test('a diagram theme lasts for that viewer only, and does not persist', async ({ page }) => {
  const openViewer = async () => {
    await page.getByText('Example — Mermaid diagram').hover()
    await page.getByRole('button', { name: 'View diagram' }).click()
    const viewer = page.locator('.viewer-backdrop')
    await expect(viewer.locator('.mermaid-diagram svg').first()).toBeVisible()
    return viewer
  }
  const pressed = (viewer, label) =>
    themeButton(viewer, label).evaluate((el) => el.getAttribute('aria-pressed') === 'true')

  let viewer = await openViewer()
  expect(await pressed(viewer, 'Auto'), 'a viewer opens on the default').toBe(true)

  // Dark, not Light: the app's own ground is light here, so a diagram pinned
  // light agrees with it and asks for no paper — nothing to observe.
  await themeButton(viewer, 'Dark').click()
  await expect(viewer.locator('.mermaid-diagram .host')).toHaveAttribute('data-paper', 'dark')
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()

  // The next viewing starts from the default again.
  viewer = await openViewer()
  expect(await pressed(viewer, 'Auto'), 'the pin must not outlive its viewer').toBe(true)
  expect(await viewer.locator('.mermaid-diagram .host').getAttribute('data-paper')).toBeNull()

  // ...and nothing was written to the stored preference.
  const stored = await page.evaluate(() => JSON.parse(window.api.storeLoad('settings') ?? '{}'))
  expect(stored.diagramTheme ?? 'auto').toBe('auto')
})

// Auto means "follow the app". Flipping the app's ground has to REDRAW the
// diagram, not just re-tint around it: Mermaid bakes its palette into the SVG at
// render time, so a diagram drawn for the dark theme keeps its light-on-dark ink
// until it is rendered again.
test('an Auto diagram redraws when the app theme flips', async ({ app, page }) => {
  await clickAppMenuItem(app, 'Settings')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Use the Dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Escape')

  await page.getByText('Example — Mermaid diagram').hover()
  await page.getByRole('button', { name: 'View diagram' }).click()
  const viewer = page.locator('.viewer-backdrop')
  await expect(viewer.locator('.mermaid-diagram svg').first()).toBeVisible()

  // Drawn for the dark ground: light ink.
  let darkInk = null
  await expect.poll(async () => (darkInk = await inkLightness(viewer))).not.toBeNull()
  expect(darkInk).toBeGreaterThan(128)

  // Flip the app to Light with the viewer still open. Through the application
  // menu, because CmdOrCtrl+D is a MAIN-process accelerator — a DOM key press
  // never reaches it.
  await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // The diagram must follow — dark ink now, and still no paper of its own,
  // because Auto agrees with the ground either way.
  await inkSettles(viewer, (ink) => ink < 128)
  await expect
    .poll(() => viewer.locator('.mermaid-diagram .host').getAttribute('data-paper'))
    .toBeNull()
})

const PAPER_DARK = 'rgb(22, 27, 34)'

// The paper was painted on `.host`, which lives INSIDE the panned-and-zoomed
// `.transform`, while the `.stage` that CLIPS it kept the app's own --bg. Pinning
// a diagram against the app's ground therefore produced a floating rectangle of
// paper: dragging slid it aside and revealed the app surface underneath, and
// zooming out left it framed by it. The ground belongs to the VIEWPORT, not to
// the box that moves inside it.
test('a pinned diagram grounds the whole stage, not a box that pans away', async ({ page }) => {
  // App stays Light (the default), so pinning Dark is the mismatch — and the
  // surface that used to show through was white.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByText('Example — Mermaid diagram').hover()
  await page.getByRole('button', { name: 'View diagram' }).click()
  const viewer = page.locator('.viewer-backdrop')
  await expect(viewer.locator('.mermaid-diagram svg').first()).toBeVisible()

  const stage = viewer.locator('.stage')
  await themeButton(viewer, 'Dark').click()
  await expect(viewer.locator('.mermaid-diagram .host')).toHaveAttribute('data-paper', 'dark')

  // The clipping viewport itself wears the paper — this is the whole fix.
  await expect(stage).toHaveCSS('background-color', PAPER_DARK)

  // And prove there is genuinely uncovered stage to look at: drag the diagram
  // most of the way out of the viewport, the way the bug was reported.
  const box = await stage.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width, box.y + box.height, { steps: 10 })
  await page.mouse.up()

  const moved = await viewer.locator('.transform').boundingBox()
  expect(moved.x).toBeGreaterThan(box.x) // it really panned off the left edge
  // Whatever is now under the cursor's old spot is stage, and it is still paper.
  await expect(stage).toHaveCSS('background-color', PAPER_DARK)
})
