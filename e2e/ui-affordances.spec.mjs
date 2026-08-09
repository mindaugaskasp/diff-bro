import { test, expect, newSnippetButton } from './fixtures.mjs'

// Regression cover for UI defects found by eye. Each of these shipped once, so
// each gets a test that fails if it comes back.

test('the supported-format tiles are real buttons that open a filtered picker', async ({
  page
}) => {
  const tiles = page.locator('.chips button.chip')
  // Named rather than counted: a bare number says nothing about which tile went
  // missing, and adding Mermaid broke it with a diff that read "6 became 7".
  await expect(tiles).toHaveText([/Excel/, /JSON/, /XML/, /YAML/, /CSV/, /Markdown/, /Mermaid/])

  // Every tile is reachable and says what it opens. The tip is the app's own
  // (data-tip), not native `title`, which Electron often never draws.
  for (const tip of await tiles.evaluateAll((n) => n.map((b) => b.getAttribute('data-tip')))) {
    expect(tip).toMatch(/^Open .+ file$/)
  }
  await expect(tiles.first()).toBeEnabled()
  await expect(tiles.first()).toContainText('Excel')
})

// Shortening these tooltips once renamed the buttons: an icon-only button used
// to take its accessible name from `title`, so the short label must not be the
// only one. The name now comes from aria-label and the tip from data-tip, which
// is exactly the pairing this pins.
test('icon buttons keep a descriptive name alongside the short tooltip', async ({ page }) => {
  const cases = [
    ['New', 'New snippet'],
    ['Export', 'Export all snippets to a passphrase-protected file'],
    ['Import', 'Import snippets from a file']
  ]
  for (const [tooltip, name] of cases) {
    const button = page.getByRole('button', { name })
    await expect(button, `${name} should still be findable by name`).toBeVisible()
    await expect(button).toHaveAttribute('data-tip', tooltip)
  }
})

test('a tool panel copy button has a hover tooltip, not just an aria-label', async ({ page }) => {
  await page.getByRole('button', { name: 'Search every tool' }).click()
  await page.keyboard.type('json')
  await page.keyboard.press('Enter')
  const dlg = page.getByRole('dialog', { name: 'JSON' })
  await dlg.getByLabel('JSON', { exact: true }).fill('{"a":1}')
  await expect(dlg.locator('.tjs-copy')).toHaveAttribute('data-tip', 'Copy')

  // …and it renders on hover, rather than relying on the OS to draw it.
  await dlg.locator('.tjs-copy').hover()
  await expect(page.locator('.tip-bubble')).toHaveText('Copy')
})

// The preview used to open from anywhere on the row, so it appeared while you
// were only reaching for the row's buttons.
test('the snippet preview opens from the row, but not from its controls', async ({ page }) => {
  const row = page.locator('li.row').first()
  await expect(row).toBeVisible()

  // The star and the row actions keep their own tooltips; they do not summon
  // a preview card.
  await row.locator('.star').hover()
  await page.waitForTimeout(500)
  await expect(page.locator('.preview')).toHaveCount(0)

  await row.locator('.nm').hover()
  await expect(page.locator('.preview')).toBeVisible()

  // Anchored to the title instead of the row, the card covered the row buttons.
  const [card, rowBox] = await Promise.all([
    page.locator('.preview').boundingBox(),
    row.boundingBox()
  ])
  const overlaps = card.x < rowBox.x + rowBox.width && card.x + card.width > rowBox.x
  expect(overlaps, 'the preview must not sit on top of the row').toBe(false)
})

// The trigger used to be the name SPAN, which is only as tall as its glyphs: a
// few pixels of vertical drift left it and the card vanished mid-reach.
test('the preview target is the full height of the row', async ({ page }) => {
  const row = page.locator('li.row').first()
  const entry = row.locator('.entry')
  await expect(entry).toBeVisible()

  const box = await entry.boundingBox()
  const name = await row.locator('.nm').boundingBox()
  // The name text does not fill the row, so a taller target is a real gain.
  expect(box.height).toBeGreaterThan(name.height + 2)

  // Near the top edge of the row's main area.
  await page.mouse.move(0, 0)
  await entry.hover({ position: { x: Math.round(box.width / 2), y: 2 } })
  await expect(page.locator('.preview')).toBeVisible()

  // And drifting down to the bottom edge keeps it open.
  await entry.hover({ position: { x: Math.round(box.width / 2), y: box.height - 2 } })
  await page.waitForTimeout(300)
  await expect(page.locator('.preview')).toBeVisible()
})

// The first section label is a pseudo-element above its row; too small a margin
// clipped "Recent" against the search bar.
test('the palette section label has room above its first row', async ({ page }) => {
  await page.getByRole('button', { name: 'Search every tool' }).click()
  await expect(page.locator('.cp')).toBeVisible()

  const room = await page
    .locator('.cp-row[data-section]')
    .first()
    .evaluate((el) => {
      const listTop = el.closest('.cp-list').getBoundingClientRect().top
      const labelHeight = parseFloat(getComputedStyle(el, '::before').height) || 0
      return el.getBoundingClientRect().top - listTop - labelHeight
    })
  expect(room, 'the label would overlap the row above it').toBeGreaterThan(0)
})

// Native `title` tooltips are drawn by the OS, so they are invisible to the app,
// unstyleable and slow. This asserts a tooltip the page actually renders.
test('hovering an icon button shows a visible tooltip', async ({ page }) => {
  const button = newSnippetButton(page)
  await button.hover()

  const tip = page.locator('.tip-bubble')
  await expect(tip).toBeVisible()
  await expect(tip).toHaveText('New')

  const box = await tip.boundingBox()
  expect(box.width, 'the tooltip must have real size').toBeGreaterThan(0)

  // toBeVisible() only proves it has a box — a bubble left inside the app tree
  // is capped by a parent stacking context and never painted. It must be a
  // child of body, above everything.
  const escaped = await tip.evaluate((el) => el.parentElement === document.body)
  expect(escaped, 'the tooltip must be teleported out of the app tree').toBe(true)
})

// Saved-diff rows: the actions crowded the name at rest, the delete glyph was a
// bare ✕ rather than the trash the rest of the app uses, and non-expiring diffs
// carried a "kept" label that said nothing a blank space would not.
test('saved-diff actions stay out of the way until the row is hovered', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill('a')
  await page.getByPlaceholder('Paste changed text here').fill('b')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const save = page.getByRole('dialog', { name: 'Save diff' })
  await save.getByLabel('Name', { exact: true }).fill('Row spacing')
  await save.getByRole('button', { name: 'Save', exact: true }).click()

  const row = page.locator('li.diff', { hasText: 'Row spacing' })
  await expect(row).toBeVisible()

  // At rest the actions are hidden, so the name gets the width.
  await expect(row.getByRole('button', { name: 'Delete now' })).toBeHidden()
  await expect(row).not.toContainText('kept')

  await row.hover()
  const del = row.getByRole('button', { name: 'Delete now' })
  await expect(del).toBeVisible()
  // The trash icon, like every other delete in the app.
  await expect(del.locator('svg path').first()).toHaveAttribute('d', /M3 6h18|M19 6v14/)
})

// A glyph like ⇄ tofus into a [] box on any font that lacks it, which is why
// every standalone icon in the app is an SVG from icons.js.
test('the swap control is an SVG icon, not a text glyph', async ({ page }) => {
  const swap = page.getByRole('button', { name: 'Swap sides' })
  await expect(swap.locator('svg.app-icon')).toHaveCount(1)
  expect((await swap.innerText()).trim()).toBe('')
})

// data-tip is the app's own tooltip; assistive tech never sees it. An icon-only
// button that carries no aria-label has no name at all.
test('every icon-only button carries an accessible name', async ({ page }) => {
  // Reach the ones that only exist once something is open.
  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog').first()
  await expect(editor).toBeVisible()

  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .filter((b) => !b.innerText.trim() && !b.getAttribute('aria-label'))
      .map((b) => b.className || b.getAttribute('data-tip') || '(anonymous)')
  )
  expect(unnamed).toEqual([])
})

// Reaching the card means crossing the gap between the sidebar and the card,
// where neither is hovered — the close delay has to outlast that trip.
test('the preview survives the pointer travelling into it', async ({ page }) => {
  const row = page.locator('li.row').first()
  await row.locator('.entry').hover()
  const card = page.locator('.preview')
  await expect(card).toBeVisible()

  const box = await card.boundingBox()
  // Few steps on purpose. Each one is a CDP round trip, and twelve of them over
  // a ~28px move measures harness latency rather than the app: on a loaded
  // runner they outlast the 160ms close delay and the card shuts mid-trip,
  // which cost two release builds. Four still puts the pointer down inside the
  // gap — the thing being tested — over the same distance a user crosses.
  await page.mouse.move(box.x + 20, box.y + 20, { steps: 4 })
  await page.waitForTimeout(400)
  await expect(card).toBeVisible()
})

// A control's painted surface and its ratio against the band behind it.
// Chromium resolves color-mix() to rgba() or color(srgb …) by version, so both.
const SURFACE = (buttonSel, groundSel) => `(() => {
  const parse = (s) => {
    const rgb = s.match(/^rgba?\\(([^)]+)\\)$/)
    if (rgb) {
      const p = rgb[1].split(/[\\s,/]+/).filter(Boolean).map(Number)
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }
    const srgb = s.match(/^color\\(srgb ([^)]+)\\)$/)
    if (srgb) {
      const p = srgb[1].split(/[\\s/]+/).filter(Boolean).map(Number)
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }
    }
    throw new Error('cannot parse colour: ' + s)
  }
  const over = (fg, bg) => [
    fg.r * fg.a + bg.r * (1 - fg.a),
    fg.g * fg.a + bg.g * (1 - fg.a),
    fg.b * fg.a + bg.b * (1 - fg.a)
  ]
  const chan = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const lum = ([r, g, b]) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
  const btn = document.querySelector(${JSON.stringify(buttonSel)})
  const ground = document.querySelector(${JSON.stringify(groundSel)})
  const bs = getComputedStyle(btn)
  const face = parse(bs.backgroundColor)
  const gc = parse(getComputedStyle(ground).backgroundColor)
  const painted = over(face, gc)
  const bare = [gc.r, gc.g, gc.b]
  const [hi, lo] = [lum(painted), lum(bare)].sort((a, b) => b - a)
  return {
    alpha: face.a,
    shadow: bs.boxShadow,
    contrast: (hi + 0.05) / (lo + 0.05),
    background: bs.backgroundColor
  }
})()`

// A ghost button had no fill, so its contrast against the band was exactly 1.00
// — the same nothing a disabled control shows.
test('a resting toolbar button has a surface of its own', async ({ page }) => {
  const paste = page.getByRole('button', { name: 'Paste mode' })
  await expect(paste).toBeEnabled()

  const s = await page.evaluate(SURFACE('.toolbar .btn:not(:disabled)', '.toolbar'))
  expect(s.alpha, `resting background was ${s.background}`).toBeGreaterThan(0)
  expect(s.contrast, 'the button must be distinguishable from the band it sits on').toBeGreaterThan(
    1.2
  )
})

// Enabled and disabled used to differ by one alpha step on one axis. Whatever
// the resting state gains, disabled must not have.
test('a disabled toolbar button differs from a resting one by more than opacity', async ({
  page
}) => {
  const capture = page.getByRole('button', { name: 'Capture' })
  await expect(capture).toBeDisabled()

  const rest = await page.evaluate(SURFACE('.toolbar .btn:not(:disabled)', '.toolbar'))
  // Not the primary — a disabled Save keeps its accent fill on purpose.
  const off = await page.evaluate(SURFACE('.toolbar .btn:disabled:not(.btn-primary)', '.toolbar'))

  expect(rest.alpha, 'a resting button paints a plate').toBeGreaterThan(0)
  expect(off.alpha, 'a disabled button paints none').toBe(0)
  expect(rest.shadow, 'a resting button is lifted').not.toBe('none')
  expect(off.shadow, 'a disabled button is flat').toBe('none')
})

// AppToolbar bound :class="{ active: inPaste }" for a long time with no
// .btn.active rule anywhere — the toggle had no on-state at all.
test('the paste-mode toggle shows an on-state', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'Paste mode' })
  const before = await page.evaluate(SURFACE('.toolbar .btn:not(:disabled)', '.toolbar'))

  await toggle.click()
  await expect(page.getByRole('button', { name: 'File mode' })).toBeVisible()
  // After a click the pointer still hovers, and mid-transition the computed
  // value is an interpolated oklab() rather than the declared colour.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(250)

  const on = await page.evaluate(SURFACE('.toolbar .btn.active', '.toolbar'))
  expect(
    on.contrast,
    'the pressed toggle must read differently from a resting button'
  ).toBeGreaterThan(before.contrast * 1.15)
})

// Reads the primary's fill, keyline and label contrast in one go — the three
// things the hover rewrite moved between them.
const PRIMARY = `(() => {
  const parse = (s) => {
    const rgb = s.match(/^rgba?\\(([^)]+)\\)$/)
    if (rgb) {
      const p = rgb[1].split(/[\\s,/]+/).filter(Boolean).map(Number)
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }
    const srgb = s.match(/^color\\(srgb ([^)]+)\\)$/)
    if (srgb) {
      const p = srgb[1].split(/[\\s/]+/).filter(Boolean).map(Number)
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }
    }
    throw new Error('cannot parse colour: ' + s)
  }
  const chan = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b)
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  const el = document.querySelector('.empty-cta .btn-primary')
  const cs = getComputedStyle(el)
  const fill = parse(cs.backgroundColor)
  return {
    fill: cs.backgroundColor,
    edge: cs.borderTopColor,
    edgeVsFill: ratio(parse(cs.borderTopColor), fill),
    labelVsFill: ratio(parse(cs.color), fill)
  }
})()`

// The hover used to mix the fill 68% toward --text-on-accent — toward the label
// printed on it — so pointing at Save made Save harder to read: 2.39 on dark,
// against a 4.5 floor, the worst pair in the app. The fill must now stay put and
// the keyline must carry the change.
test('hovering the primary button moves its keyline, not its fill', async ({ page }) => {
  const cta = page.locator('.empty-cta .btn-primary')
  await expect(cta).toBeVisible()

  await page.mouse.move(0, 0)
  const rest = await page.evaluate(PRIMARY)
  expect(rest.labelVsFill, 'a resting primary must be readable').toBeGreaterThanOrEqual(4.5)

  await cta.hover()
  // Mid-transition the computed value is an interpolated oklab(), not the
  // declared colour — the same wait the paste-mode toggle needs.
  await page.waitForTimeout(250)
  const hover = await page.evaluate(PRIMARY)

  expect(hover.fill, 'the fill must not move on hover').toBe(rest.fill)
  expect(hover.labelVsFill, 'so the label keeps exactly its resting contrast').toBeCloseTo(
    rest.labelVsFill,
    2
  )
  expect(hover.edge, 'the keyline is what changes').not.toBe(rest.edge)
  // The bar is the neutral .btn's own shipped hover step (1.16 at worst): a
  // primary must move at least as visibly as the quiet button beside it.
  expect(hover.edgeVsFill, `keyline ${hover.edge} on fill ${hover.fill}`).toBeGreaterThan(1.16)
})

// The collapsed rail is a 48px strip; every control in it centres on the
// strip's own axis. Glued to the left edge, the rail reads as clipped.
test('the collapsed rail centres its buttons on the strip', async ({ page }) => {
  await page.getByRole('button', { name: 'Collapse the sidebar' }).click()
  const rail = page.locator('.rail')
  await expect(rail).toBeVisible()
  // The collapse animates width for 160ms — measure the settled strip.
  await expect
    .poll(async () => (await page.locator('aside.saved').boundingBox()).width)
    .toBeLessThan(49)

  const strip = await page.locator('aside.saved').boundingBox()
  const mid = strip.x + strip.width / 2
  for (const target of ['.rail-band .sidebar-toggle', '.rail-btn']) {
    const box = await page.locator(target).first().boundingBox()
    expect(Math.abs(box.x + box.width / 2 - mid)).toBeLessThanOrEqual(1.5)
  }
})
