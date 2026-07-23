import { test, expect } from './fixtures.mjs'

// Copying a snippet shows a transient "Copied" flash at the row. Playwright's
// clicks are trusted (they carry the user activation the async clipboard API
// requires), so this exercises the real copy path end to end — the unit test
// only covers the flash timer, not the wiring. The recurring "did the feedback
// actually fire?" question gets a real answer here.
test('copying a snippet flashes "Copied" and then clears', async ({ page }) => {
  const row = page.getByText('Example — Mermaid diagram')
  await expect(row).toBeVisible() // the seeded first-run example

  // Row actions only reveal on hover; hover the name, then hit Copy.
  await row.hover()
  await page.getByRole('button', { name: 'Copy to clipboard' }).click()

  const flash = page.getByText('Copied', { exact: true })
  await expect(flash).toBeVisible()
  // It fades on its own (useCopyFeedback timer), not on another interaction.
  await expect(flash).toBeHidden()
})
