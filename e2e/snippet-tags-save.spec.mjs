import {
  test,
  expect,
  openNewSnippet,
  snippetDoc,
  closeSnippet,
  docActions,
  clickAppMenuItem
} from './fixtures.mjs'

const saveButton = (page) => docActions(page).getByRole('button', { name: 'Save', exact: true })
const row = (page, name) => page.locator('.snippets-section li.row', { hasText: name }).first()
const headTags = (doc) => doc.locator('.tag-row > .etag')

async function saveSnippet(page, name, tags) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(name)
  for (const tag of tags) {
    await doc.locator('.taginput').fill(tag)
    await doc.locator('.taginput').press('Enter')
  }
  await doc.locator('.editor').click()
  await page.keyboard.type('body')
  await saveButton(page).click()
  await expect(doc).toBeHidden()
  await closeSnippet(page)
}

async function reopen(page, name) {
  await row(page, name).click()
  const doc = snippetDoc(page)
  await expect(doc.locator('.editor')).toBeVisible()
  return doc
}

const startAddingTags = async (doc) => {
  await doc.getByRole('button', { name: 'Add tag' }).click()
  await expect(doc.locator('.taginput')).toBeFocused()
}

test('a tag removed with × stays removed after saving and reopening', async ({ page }) => {
  await saveSnippet(page, 'Removal', ['alpha', 'beta'])
  const doc = await reopen(page, 'Removal')
  await startAddingTags(doc)

  const alpha = headTags(doc).filter({ hasText: 'alpha' })
  await alpha.hover()
  await alpha.getByRole('button').click()
  await saveButton(page).click()
  await closeSnippet(page)

  const again = await reopen(page, 'Removal')
  await expect(headTags(again)).toHaveText(['beta'])
})

test('a tag added after a removal is saved too', async ({ page }) => {
  await saveSnippet(page, 'Both ways', ['alpha', 'beta'])
  const doc = await reopen(page, 'Both ways')
  await startAddingTags(doc)

  const alpha = headTags(doc).filter({ hasText: 'alpha' })
  await alpha.hover()
  await alpha.getByRole('button').click()
  await doc.locator('.taginput').fill('gamma')
  await doc.locator('.taginput').press('Enter')
  await saveButton(page).click()
  await closeSnippet(page)

  const again = await reopen(page, 'Both ways')
  await expect(headTags(again)).toHaveText(['beta', 'gamma'])
})

test('adding a tag alone can be saved, and closing without saving asks first', async ({ page }) => {
  await saveSnippet(page, 'Only a tag', ['alpha'])
  const doc = await reopen(page, 'Only a tag')
  await expect(saveButton(page)).toBeDisabled()

  await startAddingTags(doc)
  await doc.locator('.taginput').fill('beta')
  await doc.locator('.taginput').press('Enter')
  await expect(saveButton(page)).toBeEnabled()
  await expect(page.locator('.diff-tabs .tab.active .dirty')).toBeVisible()

  await page.locator('.diff-tabs .tab.active .tab-close').click()
  const ask = page.getByRole('dialog', { name: 'Close snippet?' })
  await ask.getByRole('button', { name: 'Keep it open' }).click()

  await saveButton(page).click()
  await closeSnippet(page)
  const again = await reopen(page, 'Only a tag')
  await expect(headTags(again)).toHaveText(['alpha', 'beta'])
})

test('a tag still being typed when saving goes in with the save', async ({ app, page }) => {
  await saveSnippet(page, 'Typed', ['alpha'])
  const doc = await reopen(page, 'Typed')
  await startAddingTags(doc)
  await doc.locator('.taginput').pressSequentially('beta')
  await expect(saveButton(page)).toBeEnabled()
  await clickAppMenuItem(app, 'Save')
  await expect(saveButton(page)).toBeDisabled()
  await closeSnippet(page)

  const again = await reopen(page, 'Typed')
  await expect(headTags(again)).toHaveText(['alpha', 'beta'])
})

test('a tag too deep to save holds the save back and says why', async ({ app, page }) => {
  await saveSnippet(page, 'Too deep', ['alpha'])
  const doc = await reopen(page, 'Too deep')
  await startAddingTags(doc)
  await doc.locator('.taginput').pressSequentially('a/b/c/d')
  await clickAppMenuItem(app, 'Save')
  await expect(doc.locator('.too-deep')).toBeVisible()
  await expect(saveButton(page)).toBeEnabled()
})
