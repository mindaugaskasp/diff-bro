import { test, expect, newSnippetButton, showPanel } from './fixtures.mjs'

async function typeSnippet(page, text) {
  await showPanel(page, 'snippets')
  await newSnippetButton(page).click()
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.locator('.monaco-editor').first().click()
  await page.keyboard.insertText(text)
  return doc
}

const copyButton = (page) =>
  page.locator('#toolbar-doc-actions').getByRole('button', { name: 'Copy', exact: true })

test('the document copy asks for placeholders, in any language', async ({ app, page }) => {
  await typeSnippet(page, 'const who = "{{person}}"')
  await copyButton(page).click()
  await page.locator('.fill-row', { hasText: 'person' }).getByRole('textbox').fill('Ada')
  await page.getByRole('button', { name: 'Copy filled' }).click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toBe('const who = "Ada"')
})

test('leaving a placeholder blank copies it as written', async ({ app, page }) => {
  await typeSnippet(page, 'Hello {{person}}')
  await copyButton(page).click()
  await page.getByRole('button', { name: 'Copy filled' }).click()
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toBe('Hello {{person}}')
})

test('text with no placeholders copies straight away', async ({ app, page }) => {
  await typeSnippet(page, 'plain words')
  await copyButton(page).click()
  await expect(page.getByRole('button', { name: 'Copy filled' })).toHaveCount(0)
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('plain words')
})
