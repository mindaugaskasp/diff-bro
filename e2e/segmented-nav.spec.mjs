import { test, expect } from './fixtures.mjs'

const nav = (page) => page.locator('.sidebar-nav')
const segment = (page, panel) => nav(page).locator(`[data-value="${panel}"]`)
const aside = (page) => page.locator('aside.saved')

test('five places, in a fixed order, at the top of the sidebar; no rail', async ({ page }) => {
  const order = await nav(page)
    .locator('[data-value]')
    .evaluateAll((els) => els.map((el) => el.dataset.value))
  expect(order).toEqual(['home', 'diffs', 'snippets', 'tools', 'keys'])
  await expect(page.locator('.rail')).toHaveCount(0)

  for (const panel of order) {
    await segment(page, panel).click()
    await expect(segment(page, panel)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(`.usb-panel[data-panel="${panel}"]`)).toBeVisible()
  }
})

test('the segmented band lines up with the top bar across the divider', async ({ page }) => {
  const [navBox, barBox] = await Promise.all([
    nav(page).boundingBox(),
    page.locator('.topbar').boundingBox()
  ])
  expect(Math.abs(navBox.y + navBox.height - (barBox.y + barBox.height))).toBeLessThanOrEqual(1)
})

test('arrow keys move between the segments', async ({ page }) => {
  await segment(page, 'snippets').click()
  await page.keyboard.press('ArrowRight')
  await expect(segment(page, 'tools')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(segment(page, 'snippets')).toHaveAttribute('aria-pressed', 'true')
})

test('Trusted keys is a segment, and no longer a menu item', async ({ page }) => {
  await segment(page, 'keys').click()
  await expect(page.locator('.usb-panel[data-panel="keys"]')).toBeVisible()
  await page.locator('.menubar').getByRole('button', { name: 'Security', exact: true }).click()
  const menu = page.locator('.menubar .menu > .dropdown')
  await menu.locator(':scope > .submenu > .item', { hasText: 'Trusted Keys' }).hover()
  await expect(menu.locator('.flyout .item', { hasText: 'Add Trusted Key' })).toBeVisible()
  await expect(menu.locator('.flyout .item', { hasText: 'Manage Trusted Keys' })).toHaveCount(0)
})

test('the edge handle hides the sidebar, and the left strip brings it back', async ({ page }) => {
  const handle = page.getByRole('button', { name: 'Hide the sidebar' })
  await page.locator('.usb-grip').hover()
  await expect(handle).toBeVisible()
  await handle.click()
  await expect.poll(async () => (await aside(page).boundingBox()).width).toBeLessThan(2)
  await expect(nav(page)).toBeHidden()

  const show = page.getByRole('button', { name: 'Show the sidebar' })
  await page.locator('.sidebar-strip').hover()
  await show.click()
  await expect(nav(page)).toBeVisible()
  await expect.poll(async () => (await aside(page).boundingBox()).width).toBeGreaterThan(300)
})

// Invisible until its seam is pointed at, so until then it must not take the
// clicks meant for the rows beneath it (the star at a row's right end).
test('the hidden edge handle does not take clicks meant for the rows', async ({ page }) => {
  await page.mouse.move(600, 400)
  const handle = page.getByRole('button', { name: 'Hide the sidebar' })
  const box = await handle.boundingBox()
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('.sidebar-handle') !== null,
    [box.x + box.width / 2, box.y + box.height / 2]
  )
  expect(hit).toBe(false)
})
