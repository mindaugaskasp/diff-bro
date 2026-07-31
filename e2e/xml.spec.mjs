import { test, expect, openMenu } from './fixtures.mjs'

// The XML tool is a rich panel (ToolXml): Pretty/Minify, an XPath-subset filter,
// and a collapsible element tree that reads attributes on the tag. A launch
// proves the wiring, the live reactivity, and the clipboard write.
const SRC =
  '<catalog count="2"><book id="b1"><title>Dune</title></book>' +
  '<book id="b2"><title>Neuromancer</title></book></catalog>'

test('formats, filters via XPath, minifies and copies', async ({ app, page }) => {
  await openMenu(page, 'Tools', 'XML')
  const dlg = page.getByRole('dialog', { name: 'XML' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('XML', { exact: true }).fill(SRC)

  // Pretty-printed output and a rendered tree.
  await expect(dlg.locator('.txm-text')).toContainText('<catalog count="2">')
  await expect(dlg.locator('.xt-tag').first()).toHaveText('catalog')

  await dlg.getByLabel('XPath filter').fill('//title')
  await expect(dlg.locator('.txm-count')).toContainText('2 matches')

  // Attribute matches are values, not elements, so they list separately.
  await dlg.getByLabel('XPath filter').fill('//book/@id')
  await expect(dlg.locator('.txm-count')).toContainText('2 matches')
  await expect(dlg.locator('.txm-values')).toContainText('b1')
  await expect(dlg.locator('.txm-values')).toContainText('b2')

  await dlg.getByLabel('XPath filter').fill('')
  await dlg.locator('.seg-opt', { hasText: 'Minify' }).click()
  await expect(dlg.locator('.txm-text')).toHaveText(SRC)
  await dlg.locator('.txm-copy').click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toBe(SRC)
})

test('reports malformed XML with its location', async ({ page }) => {
  await openMenu(page, 'Tools', 'XML')
  const dlg = page.getByRole('dialog', { name: 'XML' })
  await dlg.getByLabel('XML', { exact: true }).fill('<a>\n  <b></c>\n</a>')
  await expect(dlg.locator('.txm-err')).toBeVisible()
  await expect(dlg.locator('.txm-err')).toContainText('line')
})
