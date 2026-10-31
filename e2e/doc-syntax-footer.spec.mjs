import {
  test,
  expect,
  openNewSnippet,
  docActions,
  markSecret,
  snippetMoreMenu
} from './fixtures.mjs'

async function newSnippet(page, name, body) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(name)
  await doc.locator('.editor').click()
  await page.keyboard.insertText(body)
  return doc
}

const save = (page) => docActions(page).getByRole('button', { name: 'Save', exact: true }).click()

test('the document is a name and tags head over its text, with no Content band', async ({
  page
}) => {
  const doc = await newSnippet(page, 'Restart api', 'kubectl rollout restart deployment/api')
  await expect(doc.locator('.doc-head')).toBeVisible()
  await expect(doc.locator('.editor-header')).toHaveCount(0)
  await expect(doc.getByRole('checkbox', { name: /Secret/ })).toHaveCount(0)
  const field = doc.locator('.doc-name .ghost-field')
  expect(await field.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)')
})

test('the footer picker changes the language, and Auto names what it found', async ({ page }) => {
  const doc = await newSnippet(page, 'Config', '{"replicas": 3}')
  const syntax = doc.locator('.editor-status').getByRole('combobox', { name: 'Syntax' })
  await expect(syntax.locator('option:checked')).toHaveText('Auto-detect · JSON')

  await syntax.selectOption('yaml')
  await expect(syntax).toHaveValue('yaml')
  await save(page)
  const saved = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(saved.locator('.editor-status').getByRole('combobox')).toHaveValue('yaml')
})

test('Format is in the ⋯ menu', async ({ page }) => {
  const doc = await newSnippet(page, 'Config', '{"replicas":3}')
  await snippetMoreMenu(page).click()
  await page.getByRole('menuitem', { name: 'Format' }).click()
  await expect(doc.locator('.view-lines')).toContainText('"replicas": 3')
})

test('the gutter fits its digits', async ({ page }) => {
  const doc = await newSnippet(page, 'Restart api', 'kubectl rollout restart deployment/api')
  const margin = await doc.locator('.monaco-editor .margin').boundingBox()
  expect(margin.width).toBeLessThanOrEqual(40)
})

test('Secret is set from the row menu, and masks the open document at once', async ({ page }) => {
  const doc = await newSnippet(page, 'Prod key', 'sk-live-0123')
  await save(page)
  const view = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(view.locator('.view-lines')).toContainText('sk-live-0123')

  await markSecret(page, 'Prod key')
  await expect(view.locator('.secret-mask')).toBeVisible()
  await expect(doc.locator('.view-lines')).toHaveCount(0)
  await expect(
    page.locator('.snippets-section .row', { hasText: 'Prod key' }).first().locator('.secret-mark')
  ).toBeVisible()

  await markSecret(page, 'Prod key', false)
  await expect(view.locator('.view-lines')).toContainText('sk-live-0123')
})
