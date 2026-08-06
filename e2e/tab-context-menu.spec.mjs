import { test, expect } from './fixtures.mjs'

// Right-clicking a tab is only real in a launched app: a native contextmenu
// event, a menu positioned against the actual viewport, and — the part that
// matters — one discard prompt for a close that takes several tabs rather than
// one dialog per tab. jsdom has no viewport to be clamped by.

const tabs = (page) => page.locator('.diff-tabs .tab')
const menu = (page) => page.getByRole('menu', { name: 'Tab actions' })
const item = (page, name) => menu(page).getByRole('menuitem', { name, exact: true })

// Each comparison is saved as it is made, so the strip fills without leaving
// unsaved work behind — the prompt has its own tests below.
async function savedTabs(page, count) {
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      await page.locator('.diff-tabs').getByRole('button', { name: 'New comparison' }).click()
    }
    await page.getByRole('button', { name: 'Paste mode' }).click()
    await page.getByPlaceholder('Paste original text here').fill(`left ${i}`)
    await page.getByPlaceholder('Paste changed text here').fill(`right ${i}`)
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Save diff' })
    await dialog.getByLabel('Name', { exact: true }).fill(`tab ${i}`)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('li.diff', { hasText: `tab ${i}` })).toBeVisible()
  }
  await expect(tabs(page)).toHaveCount(count)
}

const openMenuOn = async (page, n) => {
  await tabs(page).nth(n).click({ button: 'right' })
  await expect(menu(page)).toBeVisible()
}

test('right-clicking a tab opens the menu, and Escape dismisses it', async ({ page }) => {
  await savedTabs(page, 2)
  await openMenuOn(page, 0)
  await expect(item(page, 'Close')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()
  await expect(tabs(page)).toHaveCount(2)
})

// Disabled rather than missing: an item that vanished would move the ones under
// it, so the same click would mean different things on different tabs.
test('every action is always listed, and the ones that would do nothing are disabled', async ({
  page
}) => {
  await savedTabs(page, 3)

  await openMenuOn(page, 0)
  await expect(menu(page).getByRole('menuitem')).toHaveCount(5)
  await expect(item(page, 'Close to the Left')).toBeDisabled()
  await expect(item(page, 'Close to the Right')).toBeEnabled()
  await page.keyboard.press('Escape')

  await openMenuOn(page, 2)
  await expect(item(page, 'Close to the Left')).toBeEnabled()
  await expect(item(page, 'Close to the Right')).toBeDisabled()
})

test('closes everything to the right of the tab it was opened on', async ({ page }) => {
  await savedTabs(page, 4)
  await openMenuOn(page, 1)
  await item(page, 'Close to the Right').click()
  await expect(tabs(page)).toHaveCount(2)
  await expect(tabs(page).nth(0)).toContainText('tab 0')
  await expect(tabs(page).nth(1)).toContainText('tab 1')
})

test('closes everything to the left, keeping the tab it was opened on', async ({ page }) => {
  await savedTabs(page, 4)
  await openMenuOn(page, 2)
  await item(page, 'Close to the Left').click()
  await expect(tabs(page)).toHaveCount(2)
  await expect(tabs(page).nth(0)).toContainText('tab 2')
})

test('Close Others leaves the anchor, and it is the one on screen', async ({ page }) => {
  await savedTabs(page, 4)
  await openMenuOn(page, 1)
  await item(page, 'Close Others').click()
  await expect(tabs(page)).toHaveCount(1)
  await expect(tabs(page).nth(0)).toContainText('tab 1')
  await expect(tabs(page).nth(0)).toHaveClass(/active/)
})

// close() already refuses to leave an empty window, so Close All lands on a
// blank comparison rather than a state with no document at all.
test('Close All returns to a single blank comparison, not an empty window', async ({ page }) => {
  await savedTabs(page, 3)
  await openMenuOn(page, 0)
  await item(page, 'Close All').click()
  await expect(tabs(page)).toHaveCount(1)
  await expect(page.locator('.diff-tabs')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Paste mode' })).toBeVisible()
})

// The reported trap: the discard dialog names ONE comparison, so a bulk close
// over several unsaved tabs would have stacked one dialog per tab.
test('a bulk close over unsaved work asks once, and counts', async ({ page }) => {
  await savedTabs(page, 1)
  for (const text of ['first', 'second']) {
    await page.locator('.diff-tabs').getByRole('button', { name: 'New comparison' }).click()
    await page.getByRole('button', { name: 'Paste mode' }).click()
    await page.getByPlaceholder('Paste original text here').fill(text)
    await page.getByPlaceholder('Paste changed text here').fill(`${text} changed`)
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
  }
  await expect(tabs(page)).toHaveCount(3)

  await openMenuOn(page, 0)
  await item(page, 'Close to the Right').click()

  const dialog = page.getByRole('dialog', { name: 'Close comparisons?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('2')
  await expect(page.getByRole('dialog')).toHaveCount(1)

  await dialog.getByRole('button', { name: 'Keep them open' }).click()
  await expect(tabs(page)).toHaveCount(3)

  await openMenuOn(page, 0)
  await item(page, 'Close to the Right').click()
  await page
    .getByRole('dialog', { name: 'Close comparisons?' })
    .getByRole('button', { name: 'Close them' })
    .click()
  await expect(tabs(page)).toHaveCount(1)
})

test('a close that takes no unsaved work does not ask at all', async ({ page }) => {
  await savedTabs(page, 3)
  await openMenuOn(page, 0)
  await item(page, 'Close to the Right').click()
  await expect(tabs(page)).toHaveCount(1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

// Shift+F10 is the platform's "open the context menu here". Without it the
// strip is pointer-only.
test('the menu opens from the keyboard and runs the highlighted item', async ({ page }) => {
  await savedTabs(page, 3)
  await tabs(page).nth(0).getByRole('tab').focus()
  await page.keyboard.press('Shift+F10')
  await expect(menu(page)).toBeVisible()

  // First item is pre-selected on a keyboard open; arrow past Close Others to
  // Close to the Right.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(menu(page)).toBeHidden()
  await expect(tabs(page)).toHaveCount(1)
})

test('the menu stays inside the window when opened on the last tab', async ({ page }) => {
  await savedTabs(page, 3)
  const box = await tabs(page).nth(2).boundingBox()
  await page.mouse.click(box.x + box.width - 2, box.y + box.height - 2, { button: 'right' })
  await expect(menu(page)).toBeVisible()

  const fits = await page.evaluate(() => {
    const r = document.querySelector('[role="menu"]').getBoundingClientRect()
    return r.right <= window.innerWidth && r.bottom <= window.innerHeight && r.left >= 0
  })
  expect(fits).toBe(true)
})
