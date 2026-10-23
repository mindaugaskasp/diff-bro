import { test, expect, showPanel, editInPlace } from './fixtures.mjs'

// The bug: pressing Edit leaves focus on <body>, so Monaco never saw ⌘F.
const FIND = 'ControlOrMeta+f'

async function openSnippet(page) {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
  const doc = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(doc).toBeVisible()
  return doc
}

const findWidget = (page) => page.locator('.snippet-doc:visible .find-widget')

test('⌘F straight after Edit opens find with replace expanded', async ({ page }) => {
  await openSnippet(page)
  await editInPlace(page)
  await page.keyboard.press(FIND)

  await expect(findWidget(page)).toHaveClass(/visible/)
  await expect(findWidget(page).locator('.replace-part .input')).toBeVisible()
})

test('⌘F from the name field still opens find in the content', async ({ page }) => {
  await openSnippet(page)
  await editInPlace(page)
  await page.getByRole('region', { name: 'Edit Snippet' }).getByPlaceholder('Snippet name…').click()
  await page.keyboard.press(FIND)
  await expect(findWidget(page)).toHaveClass(/visible/)
})

test('⌘F while only viewing opens find without replace', async ({ page }) => {
  await openSnippet(page)
  await page.keyboard.press(FIND)
  await expect(findWidget(page)).toHaveClass(/visible/)
  await expect(findWidget(page).locator('.replace-part .input')).toBeHidden()
})
