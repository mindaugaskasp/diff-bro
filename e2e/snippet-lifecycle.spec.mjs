import { test, expect, openNewSnippet, editInPlace, closeSnippet, docActions } from './fixtures.mjs'

// Full snippet CRUD through the real vault: create (encrypt + store), see it in
// the list, edit (decrypt → update), and delete (with its confirm dialog). The
// unit tests cover the store; this proves the UI round-trip end to end.
test('a snippet can be created, edited, and deleted', async ({ page }) => {
  // --- create ---
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New Snippet' })
  await expect(editor).toBeVisible()

  await editor.getByPlaceholder('Snippet name…').fill('My note')
  await editor.locator('.editor').click()
  await page.keyboard.type('remember to hydrate')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()

  // Saving leaves the tab showing what was saved, and the row lands in the list.
  await expect(editor).toBeHidden()
  await expect(page.getByRole('region', { name: 'Snippet', exact: true })).toBeVisible()
  const row = page.locator('.snippets-section .row', { hasText: 'My note' })
  await expect(row).toBeVisible()

  // --- edit (rename) ---
  // Clicking the row opens the snippet; a press on it edits in place.
  await row.locator('.entry').click()
  const view = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(view).toBeVisible()
  await editInPlace(page)
  const edit = page.getByRole('region', { name: 'Edit Snippet' })
  await expect(edit).toBeVisible()
  // Nothing to save until something changes.
  await expect(docActions(page).getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await edit.getByPlaceholder('Snippet name…').fill('My renamed note')
  await expect(docActions(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()

  await expect(edit).toBeHidden()
  const saved = page.getByRole('region', { name: 'Snippet', exact: true })
  await closeSnippet(page)
  await expect(saved).toBeHidden()

  const rows = page.locator('.snippets-section .row')
  await expect(rows.filter({ hasText: 'My renamed note' })).toBeVisible()
  await expect(rows.filter({ hasText: /^My note$/ })).toHaveCount(0)

  // --- delete (with confirm) ---
  const renamed = page.locator('.snippets-section .row', { hasText: 'My renamed note' })
  await renamed.hover()
  await renamed.getByRole('button', { name: 'Delete' }).click()
  const del = page.getByRole('dialog', { name: 'Delete snippet?' })
  await expect(del).toBeVisible()
  await del.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByText('My renamed note', { exact: true })).toBeHidden()
})
