import { test, expect } from './fixtures.mjs'

// #144 slice 3: the menu bar and the toolbar band are gone. Tabs and actions share
// one row, every action but Save is its icon, and ≡ holds the menus.

async function newComparison(page) {
  await page
    .locator('.diff-tabs')
    .getByRole('button', { name: 'New comparison', exact: true })
    .click()
}

test('the tabs and the actions share one row above the comparison', async ({ page }) => {
  await newComparison(page)
  const bar = page.locator('.topbar')
  await expect(bar.locator('.diff-tabs')).toBeVisible()
  await expect(bar.locator('.toolbar')).toBeVisible()
  await expect(page.locator('.app > .toolbar, .app > .menubar')).toHaveCount(0)

  const add = await bar.locator('.diff-tabs .add').boundingBox()
  const save = await bar.getByRole('button', { name: 'Save', exact: true }).boundingBox()
  expect(Math.abs(add.y + add.height / 2 - (save.y + save.height / 2))).toBeLessThanOrEqual(1)
})

test('every action but Save is its icon, named for assistive tech', async ({ page }) => {
  await newComparison(page)
  const actions = page.locator('.toolbar .btn:visible')
  await expect(actions.first()).toBeVisible()
  for (const btn of await actions.all()) {
    const primary = await btn.evaluate((el) => el.classList.contains('btn-primary'))
    const text = (await btn.innerText()).trim()
    if (primary) expect(text).toBe('Save')
    else {
      expect(text, 'a non-primary action draws no word').toBe('')
      expect(await btn.getAttribute('aria-label')).toBeTruthy()
    }
  }
})

test('≡ reaches every menu, three levels deep', async ({ page }) => {
  test.skip(process.platform === 'darwin', 'macOS keeps the native menu bar')
  const menuButton = page.locator('.menubar').getByRole('button', { name: 'Menu', exact: true })
  await menuButton.click()
  const top = page.locator('.menubar > .dropdown > .submenu > .item')
  await expect(top).toHaveText(['File', 'Edit', 'View', 'Security', 'Tools', 'Help'])

  await top.filter({ hasText: 'Tools' }).hover()
  const tools = page.locator('.menubar > .dropdown > .submenu > .flyout')
  await tools.locator(':scope > .submenu > .item', { hasText: 'Format' }).hover()
  await tools.locator('.flyout .item', { hasText: 'JSON' }).click()
  await expect(page.getByRole('dialog', { name: 'JSON' })).toBeVisible()
  await expect(page.locator('.menubar > .dropdown')).toHaveCount(0)
})

test('Escape closes the ≡ menu', async ({ page }) => {
  test.skip(process.platform === 'darwin', 'macOS keeps the native menu bar')
  await page.locator('.menubar').getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.locator('.menubar > .dropdown')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.menubar > .dropdown')).toHaveCount(0)
})
