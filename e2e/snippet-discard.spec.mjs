import { test, expect } from './fixtures.mjs'

// Cancelling (or ×-ing) a new snippet that has typed/pasted content must not
// silently throw it away — a real bug only a launch reproduces, since the guard
// lives on the dialog's close paths and Monaco feeds the "dirty" state.
test('cancelling a new snippet with typed content asks before discarding', async ({ page }) => {
  await page.getByRole('button', { name: '+ New snippet' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Snippet' })
  await expect(dialog).toBeVisible()

  await dialog.locator('.editor').click()
  await page.keyboard.type('do not lose me')

  // Cancel does not close — it raises the discard confirmation.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Discard this snippet?')).toBeVisible()

  // Keep editing returns to the editor with the content intact.
  await dialog.getByRole('button', { name: 'Keep editing' }).click()
  await expect(dialog.getByText('Discard this snippet?')).toBeHidden()
  await expect(dialog).toBeVisible()
  await expect(page.getByText('do not lose me').first()).toBeVisible()

  // Cancel again, then Discard, actually closes and drops the draft.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(dialog).toBeHidden()
})

// An untouched new snippet has nothing to protect, so Cancel closes at once.
test('cancelling an empty new snippet closes without a prompt', async ({ page }) => {
  await page.getByRole('button', { name: '+ New snippet' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Snippet' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
})
