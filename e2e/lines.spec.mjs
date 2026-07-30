import { test, expect, openMenu } from './fixtures.mjs'

// The Lines tool is a rich panel (ToolLines): clean up (trim/drop/dedupe), sort,
// and build a list (per-line find/replace, wrap, join). A launch proves the
// wiring, the live reactivity of the pipeline, and the clipboard write.

test('builds a SQL IN-clause list from a messy UUID paste and copies it', async ({ app, page }) => {
  await openMenu(page, 'Tools', 'Lines')
  const dlg = page.getByRole('dialog', { name: 'Lines' })
  await expect(dlg).toBeVisible()

  await dlg.getByLabel('Lines', { exact: true }).fill('  1a2b  \n3c4d\n\n1a2b\n5e6f  ')
  await dlg.getByLabel('Trim', { exact: true }).check()
  await dlg.getByLabel('Drop blanks', { exact: true }).check()
  await dlg.getByLabel('Dedupe', { exact: true }).check()
  await dlg.getByLabel('Prefix', { exact: true }).fill('"')
  await dlg.getByLabel('Suffix', { exact: true }).fill('"')
  await dlg.getByLabel('Separator', { exact: true }).fill(',')

  // perLine is on by default → each item on its own line, no trailing comma.
  await expect(dlg.locator('.tln-text')).toHaveText('"1a2b",\n"3c4d",\n"5e6f"')
  await expect(dlg.locator('.tln-count')).toContainText('5 → 3')
  await expect(dlg.locator('.tln-count')).toContainText('1 dup')

  await dlg.locator('.tln-copy').click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toBe('"1a2b",\n"3c4d",\n"5e6f"')
})

test('natural sort orders numbered lines by value', async ({ page }) => {
  await openMenu(page, 'Tools', 'Lines')
  const dlg = page.getByRole('dialog', { name: 'Lines' })
  await dlg.getByLabel('Lines', { exact: true }).fill('item10\nitem2\nitem1')
  await dlg.locator('.seg-opt', { hasText: 'Natural' }).click()
  await expect(dlg.locator('.tln-text')).toHaveText('item1\nitem2\nitem10')
})
