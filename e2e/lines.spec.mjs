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

test('explodes a delimited line into a wrapped list', async ({ page }) => {
  await openMenu(page, 'Tools', 'Lines')
  const dlg = page.getByRole('dialog', { name: 'Lines' })
  await dlg.getByLabel('Lines', { exact: true }).fill('aaad, adad, ddd, 444, 5f5, r4e')
  await dlg.getByLabel('Split by', { exact: true }).fill(', ')
  await dlg.getByLabel('Prefix', { exact: true }).fill('"')
  await dlg.getByLabel('Suffix', { exact: true }).fill('"')
  await dlg.getByLabel('Separator', { exact: true }).fill(',')

  await expect(dlg.locator('.tln-text')).toHaveText(
    '"aaad",\n"adad",\n"ddd",\n"444",\n"5f5",\n"r4e"'
  )
  await expect(dlg.locator('.tln-count')).toContainText('6 → 6')
})

test('natural sort orders numbered lines by value', async ({ page }) => {
  await openMenu(page, 'Tools', 'Lines')
  const dlg = page.getByRole('dialog', { name: 'Lines' })
  await dlg.getByLabel('Lines', { exact: true }).fill('item10\nitem2\nitem1')
  await dlg.locator('.seg-opt', { hasText: 'Natural' }).click()
  await expect(dlg.locator('.tln-text')).toHaveText('item1\nitem2\nitem10')
})

// Find & Replace was folded into Lines: the modes and the case toggle came with
// it, so the standalone Replace tool could go.
test('replace supports word and regex modes with a case toggle', async ({ page }) => {
  await openMenu(page, 'Tools', 'Lines')
  const dlg = page.getByRole('dialog', { name: 'Lines' })
  await dlg.getByLabel('Lines', { exact: true }).fill('cat category\nCAT')

  await dlg.getByLabel('Find', { exact: true }).fill('cat')
  await dlg.getByLabel('Replace', { exact: true }).fill('dog')
  // Text mode matches anywhere, so it lands inside "category" too — which is
  // precisely what Word mode is for.
  await expect(dlg.locator('.tln-text')).toHaveText('dog dogegory\nCAT')

  await dlg.locator('.seg-opt', { hasText: 'Word' }).click()
  await expect(dlg.locator('.tln-text')).toHaveText('dog category\nCAT')

  await dlg.getByLabel('Ignore case', { exact: true }).check()
  await expect(dlg.locator('.tln-text')).toHaveText('dog category\ndog')
  await expect(dlg.locator('.tln-count')).toContainText('replaced')

  // Regex mode resolves capture groups.
  await dlg.getByLabel('Lines', { exact: true }).fill('John Smith')
  await dlg.locator('.seg-opt', { hasText: 'Regex' }).click()
  await dlg.getByLabel('Find', { exact: true }).fill('(\\w+) (\\w+)')
  await dlg.getByLabel('Replace', { exact: true }).fill('$2, $1')
  await expect(dlg.locator('.tln-text')).toHaveText('Smith, John')
})

test('a bad regex is reported instead of silently doing nothing', async ({ page }) => {
  await openMenu(page, 'Tools', 'Lines')
  const dlg = page.getByRole('dialog', { name: 'Lines' })
  await dlg.getByLabel('Lines', { exact: true }).fill('anything')
  await dlg.locator('.seg-opt', { hasText: 'Regex' }).click()
  await dlg.getByLabel('Find', { exact: true }).fill('(')
  await expect(dlg.locator('.tln-err')).toContainText('regular expression')
})
