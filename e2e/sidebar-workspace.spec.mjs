import { test, expect, openNewSnippet, docActions } from './fixtures.mjs'

const nav = (page) => page.getByRole('navigation', { name: 'Sidebar' })
const navItem = (page, name) => nav(page).getByRole('button', { name: new RegExp(`^${name}`) })

test('the segmented control opens one panel at a time, starting on Home', async ({ page }) => {
  await expect(navItem(page, 'Home')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible()

  await navItem(page, 'Tools').click()
  await expect(navItem(page, 'Tools')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByPlaceholder('Find a tool')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent' })).toHaveCount(0)
})

test('the open panel survives a relaunch of the window state', async ({ page }) => {
  await navItem(page, 'Snippets').click()
  await page.reload()
  await expect(navItem(page, 'Snippets')).toHaveAttribute('aria-pressed', 'true')
})

test('Diffs splits mine from received', async ({ page }) => {
  await navItem(page, 'Diffs').click()
  const mine = page.getByRole('button', { name: /^Mine/ })
  const received = page.getByRole('button', { name: /^Received/ })
  await expect(mine).toHaveAttribute('aria-pressed', 'true')
  await received.click()
  await expect(received).toHaveAttribute('aria-pressed', 'true')
})

test('Mine and Received are the Diffs header, not a row of their own', async ({ page }) => {
  await navItem(page, 'Diffs').click()
  const head = page.locator('.diffs-panel .section-head')
  const mine = head.getByRole('button', { name: /^Mine/ })
  const received = head.getByRole('button', { name: /^Received/ })
  await expect(mine).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.diffs-panel .seg')).toHaveCount(0)
  expect(await mine.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/inset/)

  await received.click()
  await expect(head.getByRole('button', { name: 'Import a shared diff' })).toBeVisible()
})

test('screens for review', async ({ page }) => {
  test.skip(!process.env.SIDEBAR_SHOTS, 'manual review only')
  const dir = process.env.SIDEBAR_SHOTS
  for (const name of ['Home', 'Diffs', 'Snippets', 'Tools']) {
    await navItem(page, name).click()
    await page.waitForTimeout(300)
    await page.locator('aside.saved').screenshot({ path: `${dir}/${name.toLowerCase()}.png` })
  }
})

test('Home lists a newly created snippet under Today', async ({ page }) => {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Fresh on Home')
  await editor.locator('.editor').click()
  await page.keyboard.type('body')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()

  await navItem(page, 'Home').click()
  const today = page.locator('.home-block', { hasText: 'Recent' })
  await expect(today.locator('.home-day').first()).toHaveText('Today')
  await expect(today.locator('.home-row').first()).toContainText('Fresh on Home')
})

async function newSnippet(page, name) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type('body')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function saveDiff(page, name) {
  // A comparison starts in its own tab: Paste mode is off while a snippet is in front.
  await page.getByRole('button', { name: 'New comparison' }).click()
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('before')
  await page.getByPlaceholder('Paste or type the changed text').fill('after')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()
}

const homeItem = (page, name) => page.locator('.home .home-item', { hasText: name })

async function deleteFromHome(page, name, dialogName) {
  const item = homeItem(page, name)
  await item.hover()
  await item.getByRole('button', { name: `Delete ${name}` }).click()
  const confirm = page.getByRole('dialog', { name: dialogName })
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(confirm).toBeHidden()
}

test('Home deletes a recent snippet and a recent diff, each after confirming', async ({ page }) => {
  await newSnippet(page, 'Doomed note')
  await saveDiff(page, 'Doomed diff')
  await navItem(page, 'Home').click()

  await deleteFromHome(page, 'Doomed note', 'Delete snippet?')
  await expect(homeItem(page, 'Doomed note')).toHaveCount(0)
  await deleteFromHome(page, 'Doomed diff', 'Delete saved diff?')
  await expect(homeItem(page, 'Doomed diff')).toHaveCount(0)

  await navItem(page, 'Snippets').click()
  await expect(page.locator('.snippets-section .row', { hasText: 'Doomed note' })).toHaveCount(0)
  await navItem(page, 'Diffs').click()
  await expect(page.locator('li.diff', { hasText: 'Doomed diff' })).toHaveCount(0)
})

test('a pinned card on Home can be deleted, and a pinned tool cannot', async ({ page }) => {
  await newSnippet(page, 'Pinned note')
  await navItem(page, 'Snippets').click()
  const row = page.locator('.snippets-section .row', { hasText: 'Pinned note' })
  await row.hover()
  await row.locator('.star').click()
  await navItem(page, 'Home').click()

  const pinned = page
    .locator('.home-block')
    .filter({ has: page.getByRole('heading', { name: 'Pinned', exact: true }) })
  await expect(pinned.locator('.home-item', { hasText: 'Pinned note' })).toBeVisible()
  const item = pinned.locator('.home-item', { hasText: 'Pinned note' })
  await item.hover()
  await item.getByRole('button', { name: 'Delete Pinned note' }).click()
  await page
    .getByRole('dialog', { name: 'Delete snippet?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  await expect(page.locator('.home .home-item', { hasText: 'Pinned note' })).toHaveCount(0)

  const quick = page.locator('.home-block', { hasText: 'Quick tools' })
  await expect(quick.getByRole('button', { name: /^Delete / })).toHaveCount(0)
})
