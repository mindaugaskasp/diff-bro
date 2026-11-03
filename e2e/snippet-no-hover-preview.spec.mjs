import { test, expect, showPanel } from './fixtures.mjs'

// The hover preview card was removed (#216); a returning one would cover the list again.
test('hovering a snippet row opens no preview card', async ({ page }) => {
  await showPanel(page, 'snippets')
  const row = page.locator('.snippets-section .row', { hasText: 'Example — Mermaid diagram' })
  await expect(row.first()).toBeVisible()

  await page.mouse.move(0, 0)
  await row.first().locator('.nm').hover()
  await page.waitForTimeout(1000)

  await expect(page.locator('.snippets-section .preview')).toHaveCount(0)
})
