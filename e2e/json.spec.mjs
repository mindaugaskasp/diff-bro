import { test, expect, openMenu } from './fixtures.mjs'

// The JSON tool is a rich panel (ToolJson): Pretty/Minify/Sort, a JSONPath-subset
// filter, and a syntax-colored collapsible tree. A launch proves the wiring, the
// reactivity, and the clipboard write.
const SRC =
  '{"id":1,"name":"Ada","items":[{"id":10,"name":"alpha"},{"id":20,"name":"beta"}],"log":"{\\"x\\":1}"}'

test('formats, filters via JSONPath, minifies and copies', async ({ app, page }) => {
  await openMenu(page, 'Tools', 'JSON')
  const dlg = page.getByRole('dialog', { name: 'JSON' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('JSON', { exact: true }).fill(SRC)

  await expect(dlg.locator('.tjs-text')).toContainText('"name": "Ada"')
  await expect(dlg.locator('.jt-key').first()).toBeVisible() // tree rendered

  await dlg.getByLabel('JSONPath filter').fill('$.items[*].name')
  await expect(dlg.locator('.tjs-count')).toContainText('2 matches')
  await expect(dlg.locator('.tjs-text')).toContainText('alpha')
  await expect(dlg.locator('.tjs-text')).toContainText('beta')

  await dlg.getByLabel('JSONPath filter').fill('')
  await dlg.locator('.seg-opt', { hasText: 'Minify' }).click()
  await expect(dlg.locator('.tjs-text')).toContainText('{"id":1,"name":"Ada"')
  await dlg.locator('.tjs-copy').click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toContain('{"id":1,')
})

test('reports invalid JSON', async ({ page }) => {
  await openMenu(page, 'Tools', 'JSON')
  const dlg = page.getByRole('dialog', { name: 'JSON' })
  await dlg.getByLabel('JSON', { exact: true }).fill('{ bad: }')
  await expect(dlg.locator('.tjs-err')).toBeVisible()
})
