import { test, expect, openMenu, openSettings } from './fixtures.mjs'
import { COMMANDS } from '../src/shared/cliCommands.js'

// The pane's two structural faults were both measurable, and neither was
// caught by anything: fourteen chips that size to their labels wrapped 4·4·3·3
// with widths from 85px to 111px, and the Language row centred itself because
// `.dialog label` is a COLUMN and `align-items: center` in a column centres
// horizontally. Assertions, not a screenshot.

const openAppearance = async (page) => {
  await openSettings(page)
  await page.locator('.settings-nav .nav-item', { hasText: 'Appearance' }).click()
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

// Where the platform draws an OVERLAY scrollbar it takes no layout width, so
// the bar painted over the rightmost tile. The padding is the fix — and it is
// what this asserts, because a gap measurement alone cannot fail on Linux,
// where a CLASSIC 10px bar (base.css) already supplies exactly the gap the
// threshold looked for. Padding is the thing that differs on every platform.
test('content stays clear of the pane scrollbar', async ({ page }) => {
  await openAppearance(page)
  const seen = await page.locator('.settings-pane').evaluate((el) => {
    const style = getComputedStyle(el)
    const pane = el.getBoundingClientRect()
    const rightmost = Math.max(
      ...[...el.querySelectorAll('.theme-tile, .row, h4')].map(
        (n) => n.getBoundingClientRect().right
      )
    )
    return {
      scrolls: el.scrollHeight > el.clientHeight,
      padding: Number.parseFloat(style.paddingRight),
      bar: el.offsetWidth - el.clientWidth,
      clear: pane.right - rightmost
    }
  })
  expect(seen.scrolls).toBe(true)
  expect(seen.padding).toBeGreaterThanOrEqual(8)
  // …and the content really does sit inside both the padding and any bar.
  expect(seen.clear).toBeGreaterThanOrEqual(seen.padding + seen.bar)
})

// Terminal ▸ Commands & Setup lands on the pane that documents the CLI, not on
// wherever Settings happened to open last — and that pane lists every
// subcommand `parseCli` accepts, from the shared list the terminal help reads.
test('the Terminal menu opens Settings on the pane that documents the CLI', async ({ page }) => {
  await openMenu(page, 'Terminal', 'Commands & Setup')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await expect(page.locator('.settings-nav .nav-item.active')).toHaveText('Terminal')

  const usages = await page.locator('.cli-list dt code').allTextContents()
  expect(usages).toContain('diffbro compare <file> [<file>]')
  expect(usages).toContain('diffbro clipboard save')
  expect(usages).toHaveLength(COMMANDS.length)
  // Each one is explained, not just listed.
  expect(await page.locator('.cli-list dd').count()).toBe(usages.length)
})

// The dialog stays mounted while it is open, so the pane was read into a ref
// once at setup and never again — asking for the Terminal pane from an ALREADY
// OPEN Settings did nothing at all. The branch's own test only covered opening
// it from closed, which is the case that happened to work.
test('the Terminal menu switches panes when Settings is already open', async ({ page }) => {
  // macOS only, and not as a convenience: elsewhere the menu bar lives INSIDE
  // the window, behind the dialog's modal backdrop, so this is not a state a
  // reader can reach. On macOS the menu is the platform's own and stays live.
  test.skip(process.platform !== 'darwin', 'the in-window menu bar is behind the modal backdrop')
  await openSettings(page)
  await page.locator('.settings-nav .nav-item', { hasText: 'Storage' }).click()
  await expect(page.locator('.settings-nav .nav-item.active')).toHaveText('Storage')

  await openMenu(page, 'Terminal', 'Commands & Setup')
  await expect(page.locator('.settings-nav .nav-item.active')).toHaveText('Terminal')
  await expect(page.locator('.cli-list dt code').first()).toBeVisible()
})
