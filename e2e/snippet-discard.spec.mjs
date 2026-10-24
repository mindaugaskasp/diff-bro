import { test, expect, openNewSnippet } from './fixtures.mjs'

// Closing a new snippet that holds typed content must not silently throw it
// away. There is no Cancel any more: the tab's own close guard asks.
const closeTab = (page) => page.locator('.diff-tabs .tab.active .tab-close').click()

test('closing a new snippet with typed content asks before discarding', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New Snippet' })
  await expect(doc).toBeVisible()

  await doc.locator('.editor').click()
  await page.keyboard.type('do not lose me')

  await closeTab(page)
  const ask = page.getByRole('dialog', { name: 'Close snippet?' })
  await expect(ask).toBeVisible()

  // Keeping it returns to the editor with the content intact.
  await ask.getByRole('button', { name: 'Keep it open' }).click()
  await expect(ask).toBeHidden()
  await expect(doc).toBeVisible()
  await expect(page.getByText('do not lose me').first()).toBeVisible()

  // Closing again and confirming drops the draft.
  await closeTab(page)
  await ask.getByRole('button', { name: 'Close it' }).click()
  await expect(doc).toBeHidden()
})

// An untouched new snippet has nothing to protect, so it closes at once.
test('closing an empty new snippet does not ask', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New Snippet' })
  await expect(doc).toBeVisible()

  await closeTab(page)
  await expect(page.getByRole('dialog', { name: 'Close snippet?' })).toHaveCount(0)
  await expect(doc).toBeHidden()
})
