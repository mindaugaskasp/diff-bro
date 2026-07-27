import { test, expect } from './fixtures.mjs'

// Full snippet CRUD through the real vault: create (encrypt + store), see it in
// the list, edit (decrypt → update), and delete (with its confirm dialog). The
// unit tests cover the store; this proves the UI round-trip end to end.
test('a snippet can be created, edited, and deleted', async ({ page }) => {
  // --- create ---
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await expect(editor).toBeVisible()

  await editor.getByPlaceholder('Snippet name…').fill('My note')
  await editor.locator('.editor').click()
  await page.keyboard.type('remember to hydrate')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(editor).toBeHidden()
  const row = page.locator('.snippets-section .row', { hasText: 'My note' })
  await expect(row).toBeVisible()

  // --- edit (rename) ---
  await page.getByText('My note', { exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit Snippet' })
  await expect(edit).toBeVisible()
  // Wait for the decrypted content to load (Save enables only with content).
  await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await edit.getByPlaceholder('Snippet name…').fill('My renamed note')
  await edit.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(edit).toBeHidden()
  await expect(page.getByText('My renamed note', { exact: true })).toBeVisible()
  await expect(page.getByText('My note', { exact: true })).toBeHidden()

  // --- delete (with confirm) ---
  const renamed = page.locator('.snippets-section .row', { hasText: 'My renamed note' })
  await renamed.hover()
  await renamed.getByTitle('Delete').click()
  const del = page.getByRole('dialog', { name: 'Delete snippet?' })
  await expect(del).toBeVisible()
  await del.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByText('My renamed note', { exact: true })).toBeHidden()
})
