import { test, expect } from './fixtures.mjs'

// Regression cover for UI defects found by eye. Each of these shipped once, so
// each gets a test that fails if it comes back.

test('the supported-format tiles are real buttons that open a filtered picker', async ({
  page
}) => {
  const tiles = page.locator('.chips button.chip')
  await expect(tiles).toHaveCount(6)

  // Every tile is reachable and says what it opens.
  for (const title of await tiles.evaluateAll((n) => n.map((b) => b.title))) {
    expect(title).toMatch(/^Open .+ file$/)
  }
  await expect(tiles.first()).toBeEnabled()
  await expect(tiles.first()).toContainText('Excel')
})

// Shortening these tooltips once renamed the buttons: an icon-only button takes
// its accessible name from title, so the short label must not be the only one.
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
  await page.locator('.usb-tool-all').click()
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
test('the snippet preview opens from the title only', async ({ page }) => {
  const row = page.locator('li.row').first()
  await expect(row).toBeVisible()

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

// The first section label is a pseudo-element above its row; too small a margin
// clipped "Recent" against the search bar.
test('the palette section label has room above its first row', async ({ page }) => {
  await page.locator('.usb-tool-all').click()
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
  const button = page.getByRole('button', { name: 'New snippet' })
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

// The shelf sat closer to the seam above it than to the window edge below,
// which reads as a misaligned band once the chips wrap to a second row.
test('the tools shelf has equal space above and below its chips', async ({ page }) => {
  const pad = await page.locator('.usb-tools').evaluate((el) => {
    const s = getComputedStyle(el)
    return { top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom) }
  })
  expect(pad.top, `top ${pad.top} vs bottom ${pad.bottom}`).toBe(pad.bottom)
})
