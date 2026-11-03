import { test, expect, openNewSnippet, closeSnippet, docActions, snippetDoc } from './fixtures.mjs'

// #218: a PHP snippet sat under Untagged while its open document showed a php chip.
test('a snippet filed under Untagged shows no tag in its head', async ({ page }) => {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Php note')
  await editor.locator('.editor').click()
  await page.keyboard.type('<?php echo "hi";')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await closeSnippet(page)

  const untagged = page.locator('.snippets-section .tag-section', {
    has: page.locator('.ts-label', { hasText: /^Untagged$/ })
  })
  const row = untagged.locator('.row', { hasText: 'Php note' })
  await expect(row).toBeVisible()
  await expect(page.locator('.snippets-section .ts-label', { hasText: /^php$/ })).toHaveCount(0)

  await row.locator('.entry').click()
  await expect(snippetDoc(page).locator('.editor')).toBeVisible()
  await expect(snippetDoc(page).locator('.tag-row .etag')).toHaveCount(0)
})
