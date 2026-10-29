import { test, expect, showPanel, editInPlace } from './fixtures.mjs'

async function openSnippet(page) {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).first().click()
  const doc = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(doc).toBeVisible()
  return doc
}
const bar = (page) => page.locator('.snippet-doc:visible .editor-status')

test('the status bar counts lines, characters and template tags', async ({ page }) => {
  await openSnippet(page)
  await expect(bar(page)).toContainText(/\d+ lines · \d+ characters/)
  await expect(bar(page).getByRole('button', { name: /3 template tags/ })).toBeVisible()
  await expect(bar(page)).toContainText('Claude prompt / link')
})

test('hovering template tags lists the fill-ins and the built-ins with their values', async ({
  page
}) => {
  await openSnippet(page)
  await bar(page)
    .getByRole('button', { name: /template tags/ })
    .hover()
  const pop = page.getByRole('dialog', { name: 'Template tags' })
  await expect(pop).toBeVisible()
  for (const fill of ['{{language}}', '{{file}}', '{{concern}}'])
    await expect(pop).toContainText(fill)
  await expect(pop).toContainText(`{{year}}`)
  await expect(pop).toContainText(String(new Date().getFullYear()))
  await page.keyboard.press('Escape')
  await expect(pop).toBeHidden()
})

test('while editing, the bar follows the caret', async ({ page }) => {
  await openSnippet(page)
  await editInPlace(page)
  const edit = page.getByRole('region', { name: 'Edit snippet' })
  await edit.locator('.editor').click()
  await page.keyboard.press('End')
  const at = async () => {
    const [, line, col] = (await bar(page).textContent()).match(/Ln (\d+), Col (\d+)/)
    return { line: Number(line), col: Number(col) }
  }
  await expect(bar(page)).toContainText(/Ln \d+, Col \d+/)
  const before = await at()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(at).toEqual({ line: before.line, col: before.col - 1 })
})

test('the bar zooms the code and shows the level', async ({ page }) => {
  await openSnippet(page)
  const lines = page.locator('.snippet-doc:visible .editor .view-lines').first()
  const px = () => lines.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const before = await px()
  await bar(page).getByRole('button', { name: 'Zoom in' }).click()
  await expect(bar(page)).toContainText('110%')
  await expect.poll(px).toBeGreaterThan(before)
  await bar(page)
    .getByRole('button', { name: /Reset zoom/ })
    .click()
  await expect.poll(px).toBe(before)
})

test('the name field no longer carries its own template-tags link', async ({ page }) => {
  await openSnippet(page)
  await editInPlace(page)
  await expect(page.locator('.snippet-doc:visible .tokens-hint')).toHaveCount(0)
})
