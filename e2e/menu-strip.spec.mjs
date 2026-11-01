import { test, expect } from './fixtures.mjs'

const strip = (page) => page.locator('.menubar')
const top = (page, name) => strip(page).getByRole('button', { name, exact: true })

test.skip(process.platform === 'darwin', 'macOS keeps the native menu bar')

test('the menus are named in a strip across the whole window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(strip(page).getByRole('button')).toHaveText([
    'File',
    'Edit',
    'View',
    'Security',
    'Tools',
    'Help'
  ])
  const box = await strip(page).boundingBox()
  expect(box).toMatchObject({ x: 0, y: 0, width: 1280 })
  const sidebar = await page.locator('aside.saved').boundingBox()
  const row = await page.locator('.topbar').boundingBox()
  expect(sidebar.y).toBeGreaterThanOrEqual(box.height)
  expect(row.y).toBeGreaterThanOrEqual(box.height)
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveCount(0)
})

test('a menu opens under its name, and hovering moves to the next', async ({ page }) => {
  await top(page, 'File').click()
  const menu = strip(page).locator('.menu > .dropdown')
  await expect(menu).toHaveCount(1)
  await expect(menu.getByRole('menuitem', { name: 'Settings…' })).toBeVisible()
  const [name, list] = await Promise.all([top(page, 'File').boundingBox(), menu.boundingBox()])
  expect(list.x).toBeCloseTo(name.x, 0)
  expect(list.y).toBeGreaterThanOrEqual(name.y + name.height)

  await top(page, 'Help').hover()
  await expect(menu).toHaveCount(1)
  await expect(menu).toContainText('Keyboard Shortcuts')
})

test('a menu reaches three levels deep, and picking closes it', async ({ page }) => {
  await top(page, 'Tools').click()
  const menu = strip(page).locator('.menu > .dropdown')
  await menu.locator(':scope > .submenu > .item', { hasText: 'Format' }).hover()
  await menu.locator('.flyout .item', { hasText: 'JSON' }).click()
  await expect(page.getByRole('dialog', { name: 'JSON' })).toBeVisible()
  await expect(menu).toHaveCount(0)
})

test('Escape and a click elsewhere close it', async ({ page }) => {
  const menu = strip(page).locator('.menu > .dropdown')
  await top(page, 'Edit').click()
  await expect(menu).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await top(page, 'Edit').click()
  await page.mouse.click(640, 400)
  await expect(menu).toHaveCount(0)
})

test('the strip gives way to a presentation', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('a\n')
  await page.getByPlaceholder('Paste or type the changed text').fill('b\n')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByTestId('toolbar-present').click()
  await expect(strip(page)).toBeHidden()
})

test('there is no gear here: Settings lives in the File menu', async ({ page }) => {
  await expect(page.locator('.toolbar').getByRole('button', { name: 'Settings' })).toHaveCount(0)
})

test('on macOS the strip is gone and a gear opens Settings', async ({ app, page }) => {
  const cdp = await app.context().newCDPSession(page)
  const userAgent = await page.evaluate(() => navigator.userAgent)
  await cdp.send('Emulation.setUserAgentOverride', { userAgent, platform: 'MacIntel' })
  await page.reload()
  await expect(page.locator('.topbar')).toBeVisible()
  await expect(strip(page)).toHaveCount(0)
  await page.locator('.toolbar').getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
})
