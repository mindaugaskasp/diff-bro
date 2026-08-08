import { test, expect, openSettings } from './fixtures.mjs'

// The pane's two structural faults were both measurable, and neither was
// caught by anything: fourteen chips that size to their labels wrapped 4·4·3·3
// with widths from 85px to 111px, and the Language row centred itself because
// `.dialog label` is a COLUMN and `align-items: center` in a column centres
// horizontally. Assertions, not a screenshot.

const openAppearance = async (page) => {
  await openSettings(page)
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.locator('.theme-tile').first().waitFor()
}

test('every theme cell is the same width', async ({ page }) => {
  await openAppearance(page)
  const widths = await page
    .locator('.theme-tile')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  expect(widths.length).toBe(14)
  expect(new Set(widths).size).toBe(1)
})

test('the cells line up in columns rather than wrapping ragged', async ({ page }) => {
  await openAppearance(page)
  const lefts = await page
    .locator('.theme-tile')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))
  // However many columns the width allows, every row starts them at the same
  // x — which is what a chip row sized to its labels can never do.
  const columns = [...new Set(lefts)].sort((a, b) => a - b)
  expect(columns.length).toBeLessThanOrEqual(7)
  const gaps = columns.slice(1).map((x, i) => x - columns[i])
  for (const gap of gaps) expect(Math.abs(gap - gaps[0])).toBeLessThanOrEqual(1)
})

test('every heading and label in the pane shares one left edge', async ({ page }) => {
  await openAppearance(page)
  const lefts = await page.evaluate(() => {
    const pane = document.querySelector('.settings-appearance')
    const seen = [...pane.querySelectorAll('h4, .group-label, .row > span:first-child')]
    return seen.map((e) => ({
      t: e.textContent.trim().slice(0, 24),
      l: Math.round(e.getBoundingClientRect().left)
    }))
  })
  expect(lefts.length).toBeGreaterThanOrEqual(5)
  const edge = lefts[0].l
  for (const item of lefts) expect(Math.abs(item.l - edge)).toBeLessThanOrEqual(1)
})

test('picking a theme selects exactly one cell and applies it', async ({ page }) => {
  await openAppearance(page)
  await page.locator('.theme-tile', { hasText: 'Nord' }).click()
  await expect(page.locator('.theme-tile.active')).toHaveCount(1)
  await expect(page.locator('.theme-tile.active')).toContainText('Nord')
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('nord')
})

// The pane scrolls, and where the platform draws an OVERLAY scrollbar it takes
// no layout width — so the bar painted on top of the rightmost tile. Asserted
// as the gap the content actually leaves at the right edge, which holds whether
// the bar is an overlay or a classic one; `offsetWidth - clientWidth` would
// only ever be non-zero on the classic platforms.
const OVERLAY_BAR_PX = 10

test('content stays clear of the pane scrollbar', async ({ page }) => {
  await openAppearance(page)
  const seen = await page.locator('.settings-pane').evaluate((el, bar) => {
    const pane = el.getBoundingClientRect()
    const rightmost = Math.max(
      ...[...el.querySelectorAll('.theme-tile, .row, h4')].map(
        (n) => n.getBoundingClientRect().right
      )
    )
    return { scrolls: el.scrollHeight > el.clientHeight, clear: pane.right - rightmost, bar }
  }, OVERLAY_BAR_PX)
  expect(seen.scrolls).toBe(true)
  expect(seen.clear).toBeGreaterThanOrEqual(OVERLAY_BAR_PX)
})
