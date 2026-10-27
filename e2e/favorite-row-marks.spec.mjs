import { test, expect, openNewSnippet, showPanel, docActions } from './fixtures.mjs'

test.beforeEach(async ({ page }) => {
  await showPanel(page, 'snippets')
})

// A starred snippet once looked identical to an unstarred one and nothing failed.

const restingStar = (row) =>
  row.locator('.star').evaluate((el) => {
    const s = getComputedStyle(el)
    return { shown: s.display !== 'none', color: s.color }
  })

async function addSnippet(page, name) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type('body text')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

test('a starred snippet row keeps its star at rest, in the ink a pinned tool uses', async ({
  page
}) => {
  await addSnippet(page, 'E2E favourite target')
  const row = page.locator('.snippets-section .row').filter({ hasText: 'E2E favourite target' })

  await page.mouse.move(0, 0)
  expect((await restingStar(row)).shown, 'an unstarred row shows no star at rest').toBe(false)

  await row.hover()
  await row.locator('.star').click()
  await page.mouse.move(0, 0)
  const starred = await restingStar(row)
  expect(starred.shown, 'a starred row keeps its star at rest').toBe(true)

  await showPanel(page, 'tools')
  const tool = page.locator('.tt-cell').first()
  await tool.hover()
  await tool.locator('.tt-pin').click()
  await page.mouse.move(0, 0)
  const pin = await tool.locator('.tt-pin').evaluate((el) => getComputedStyle(el).color)
  expect(starred.color).toBe(pin)
})
