import { test, expect } from './fixtures.mjs'

// The "looks like JSON/XML — pretty-print it?" banner is driven by a store
// getter over live content, and Format rewrites the side in place. A launch
// proves the banner renders above the diff, formats, and then clears itself.
async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()
}

// The format banner is a `div.hint`; the ShortcutBar's chips are `span.hint`,
// so scope to the div to avoid a collision.
test('minified JSON offers to format, and formatting clears the banner', async ({ page }) => {
  await pasteCompare(page, '{"b":2,"a":1}', 'plain text')

  const banner = page.locator('div.hint')
  await expect(banner).toContainText('Left looks like JSON')

  await banner.getByRole('button', { name: 'Format' }).click()
  // Formatted content is multi-line, so the diff now shows a "b" line on its own.
  await expect(page.getByText('"b": 2').first()).toBeVisible()
  // Already pretty → the banner clears itself.
  await expect(page.locator('div.hint')).toBeHidden()
})

test('Dismiss hides the banner without changing the content', async ({ page }) => {
  await pasteCompare(page, '{"x":1,"y":2}', 'plain text')
  const banner = page.locator('div.hint')
  await expect(banner).toContainText('Left looks like JSON')

  await banner.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.locator('div.hint')).toBeHidden()
  // Content is untouched — the minified form is still what's shown.
  await expect(page.getByText('{"x":1,"y":2}').first()).toBeVisible()
})
