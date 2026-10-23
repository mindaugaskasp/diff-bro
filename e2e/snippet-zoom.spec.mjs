import { test, expect, clickAppMenuItem, showPanel } from './fixtures.mjs'

// One code-text zoom for every code editor: the snippet editor ignored it.
const fontPx = (locator) => locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))

async function openSnippet(page) {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
  const lines = page.locator('.snippet-doc:visible .editor .view-lines').first()
  await expect(lines).toBeVisible()
  return lines
}

test('View ▸ Zoom scales the snippet editor, and Reset puts it back', async ({ app, page }) => {
  const lines = await openSnippet(page)
  const base = await fontPx(lines)

  await clickAppMenuItem(app, 'Zoom In')
  await clickAppMenuItem(app, 'Zoom In')
  await expect.poll(() => fontPx(lines)).toBeGreaterThan(base)

  await clickAppMenuItem(app, 'Reset Zoom')
  await expect.poll(() => fontPx(lines)).toBe(base)
})

test('the zoom carries over between a comparison and a snippet', async ({ app, page }) => {
  await clickAppMenuItem(app, 'Zoom In')
  const lines = await openSnippet(page)
  const zoomed = await fontPx(lines)
  await clickAppMenuItem(app, 'Reset Zoom')
  await expect.poll(() => fontPx(lines)).toBeLessThan(zoomed)
})
