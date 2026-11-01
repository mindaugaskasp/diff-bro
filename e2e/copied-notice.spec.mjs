import { test, expect, showPanel } from './fixtures.mjs'

const NAME = 'Example — Mermaid diagram'

test('copying a row names it at the foot of the sidebar, clear of the row', async ({ page }) => {
  await showPanel(page, 'snippets')
  const row = page.locator('li.row', { hasText: NAME }).first()
  await row.hover()
  await row.getByRole('button', { name: 'Copy to clipboard' }).click()

  const notice = page.locator('.sidebar-notice')
  await expect(notice).toHaveText(`Copied Snippet - ${NAME}`)
  await expect(row.locator('.copied-flash')).toHaveCount(0)

  const [box, sidebar, rowBox] = await Promise.all([
    notice.boundingBox(),
    page.locator('aside.saved').boundingBox(),
    row.boundingBox()
  ])
  expect(box.y + box.height).toBeCloseTo(sidebar.y + sidebar.height, 0)
  expect(box.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height)
  await expect(notice).toBeHidden({ timeout: 5000 })
})
