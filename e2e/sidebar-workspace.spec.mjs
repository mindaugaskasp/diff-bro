import { test, expect, openNewSnippet } from './fixtures.mjs'

const rail = (page) => page.getByRole('navigation', { name: 'Sidebar' })
const railItem = (page, name) => rail(page).getByRole('button', { name: new RegExp(`^${name}`) })

test('the rail opens one panel at a time, starting on Home', async ({ page }) => {
  await expect(railItem(page, 'Home')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible()

  await railItem(page, 'Tools').click()
  await expect(railItem(page, 'Tools')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByPlaceholder('Find a tool')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent' })).toHaveCount(0)
})

test('the open panel survives a relaunch of the window state', async ({ page }) => {
  await railItem(page, 'Snippets').click()
  await page.reload()
  await expect(railItem(page, 'Snippets')).toHaveAttribute('aria-pressed', 'true')
})

test('Diffs splits mine from received', async ({ page }) => {
  await railItem(page, 'Diffs').click()
  const mine = page.getByRole('button', { name: /^Mine/ })
  const received = page.getByRole('button', { name: /^Received/ })
  await expect(mine).toHaveAttribute('aria-pressed', 'true')
  await received.click()
  await expect(received).toHaveAttribute('aria-pressed', 'true')
})

test('collapsing hides the panel and leaves the rail at its own width', async ({ page }) => {
  await rail(page).getByRole('button', { name: 'Collapse the sidebar' }).click()
  const railBox = await rail(page).boundingBox()
  await expect
    .poll(async () => Math.round((await page.locator('aside.saved').boundingBox()).width))
    .toBe(Math.round(railBox.width))
  await railItem(page, 'Snippets').click()
  await expect(page.getByPlaceholder('Search snippets')).toBeVisible()
})

test('arrow keys move through the rail', async ({ page }) => {
  await railItem(page, 'Home').focus()
  await page.keyboard.press('ArrowDown')
  await expect(rail(page).locator('.rail-item.on')).not.toHaveAttribute('data-panel', 'home')
})

test('screens for review', async ({ page }) => {
  test.skip(!process.env.SIDEBAR_SHOTS, 'manual review only')
  const dir = process.env.SIDEBAR_SHOTS
  for (const name of ['Home', 'Diffs', 'Snippets', 'Tools']) {
    await railItem(page, name).click()
    await page.waitForTimeout(300)
    await page.locator('aside.saved').screenshot({ path: `${dir}/${name.toLowerCase()}.png` })
  }
})

test('Home lists a newly created snippet under Today', async ({ page }) => {
  await openNewSnippet(page)
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Fresh on Home')
  await editor.locator('.editor').click()
  await page.keyboard.type('body')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()

  await railItem(page, 'Home').click()
  const today = page.locator('.home-block', { hasText: 'Recent' })
  await expect(today.locator('.home-day').first()).toHaveText('Today')
  await expect(today.locator('.home-row').first()).toContainText('Fresh on Home')
})

// The count once sat on top of its icon, hiding half the glyph.
test('a rail count clears its icon', async ({ page }) => {
  const item = rail(page).locator('.rail-item[data-panel="snippets"]')
  const [icon, count] = await Promise.all([
    item.locator('.rail-well .app-icon').boundingBox(),
    item.locator('.rail-count').boundingBox()
  ])
  expect(count.x).toBeGreaterThanOrEqual(icon.x + icon.width - 1)
})
