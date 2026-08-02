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

// A viewing preference that resets every launch is not a preference. This also
// drives the OTHER control — the editor's preview head — to prove both write the
// same setting.
test('the diagram theme survives a relaunch, set from the editor preview', async () => {
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
    await expect(reopened.locator('.mmd-preview .mermaid-diagram .host')).toHaveAttribute(
      'data-paper',
      'dark'
    )
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
