import { test, expect, openNewSnippet, docActions, editInPlace, snippetDoc } from './fixtures.mjs'

async function savedSnippet(page, language) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(`A ${language} note`)
  await page.locator('.snippet-doc:visible select.lang-select').selectOption(language)
  await doc.getByRole('button', { name: 'Plain', exact: true }).click()
  await doc.locator('.editor').click()
  await page.keyboard.type('Some text to format')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()
}

const editorTop = async (page) => (await snippetDoc(page).locator('.editor-area').boundingBox()).y

for (const language of ['markdown', 'jira']) {
  test(`a ${language} snippet keeps its place when editing starts`, async ({ page }) => {
    await savedSnippet(page, language)
    const toolbar = snippetDoc(page).getByRole('toolbar', { name: 'Formatting' })
    await expect(toolbar).toBeVisible()
    const before = await editorTop(page)
    await editInPlace(page)
    await expect.poll(() => editorTop(page)).toBe(before)
  })
}

test('the formatting buttons wait for editing', async ({ page }) => {
  await savedSnippet(page, 'markdown')
  const bold = snippetDoc(page)
    .getByRole('toolbar', { name: 'Formatting' })
    .getByRole('button')
    .first()
  await expect(bold).toBeDisabled()
  await editInPlace(page)
  await expect(bold).toBeEnabled()
})
