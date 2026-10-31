import {
  test,
  expect,
  clickAppMenuItem,
  openNewSnippet,
  newSnippetButton,
  showPanel,
  markSecret,
  snippetMoreMenu,
  docActions
} from './fixtures.mjs'

const palette = (page) => page.locator('.cp')

test('Tab stays inside the command palette, so Escape still closes it', async ({ app, page }) => {
  await clickAppMenuItem(app, 'Command Palette')
  await expect(palette(page)).toBeVisible()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.locator('.cp-input')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(palette(page)).toHaveCount(0)
})

test('the command palette can start a new snippet', async ({ app, page }) => {
  await clickAppMenuItem(app, 'Command Palette')
  await page.locator('.cp-input').fill('new snippet')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'New snippet' })).toBeVisible()
})

test('a new snippet from the sidebar is ready for its name', async ({ page }) => {
  await showPanel(page, 'snippets')
  await newSnippetButton(page).click()
  const doc = page.getByRole('region', { name: 'New snippet' })
  await expect(doc.getByPlaceholder('Snippet name…')).toBeFocused()
  await page.keyboard.type('Typed straight away')
  await expect(doc.getByPlaceholder('Snippet name…')).toHaveValue('Typed straight away')
  await expect(page.locator('.diff-tabs .tab')).toHaveCount(1)
})

test('a new snippet from the start screen is ready for its name', async ({ page }) => {
  await page.locator('.start-link', { hasText: 'New snippet' }).click()
  const doc = page.getByRole('region', { name: 'New snippet' })
  await expect(doc.getByPlaceholder('Snippet name…')).toBeFocused()
})

test('paste mode starts in the original text', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await expect(page.getByPlaceholder('Paste or type the original text')).toBeFocused()
})

test('Escape closes ⋯ on a masked secret, where every item is disabled', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill('Hidden thing')
  await doc.locator('.editor').click()
  await page.keyboard.type('secret body')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await markSecret(page, 'Hidden thing')

  await snippetMoreMenu(page).click()
  const menu = page.getByRole('menu', { name: 'More snippet actions' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
})
