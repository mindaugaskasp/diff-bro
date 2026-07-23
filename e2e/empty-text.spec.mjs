import { test, expect } from './fixtures.mjs'

// Each sidebar section shows an empty-state helper paragraph that must vanish the
// moment the section holds a real record — the "Saved diffs" half of that guard
// (the "External diffs" half rides on the peer import in sharing.spec.mjs, where
// a real shared diff actually lands). Store-getter logic drives the v-if, but
// this pins the observable behaviour so a future getter tweak can't leave stale
// help text sitting above the user's own diffs.
test('the Saved diffs helper text disappears after saving one diff', async ({ page }) => {
  const emptyText = page.getByText('Nothing saved. Load two files')
  await expect(emptyText).toBeVisible() // fresh install

  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('a')
  await page.getByPlaceholder('Paste changed text here').fill('b')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill('E2E empty-text diff')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.getByText('E2E empty-text diff')).toBeVisible()
  await expect(emptyText).toBeHidden() // gone now that a diff is filed
})
