import { test, expect } from './fixtures.mjs'

// The snippet copy test asserts the "Copied" flash fired; this asserts the
// bytes actually landed on the OS clipboard. That is the half jsdom can never
// see and the exact seam the deny-all permission handler broke: a renderer
// navigator.clipboard.writeText() is rejected, so copy goes through
// window.api.copyText -> clipboard:write (main). Reading the clipboard back
// from the main process proves that whole round-trip, not just the timer.
test('copying a snippet writes its content to the OS clipboard', async ({ app, page }) => {
  const row = page.getByText('Example — Mermaid diagram')
  await expect(row).toBeVisible() // the seeded first-run example

  await row.hover()
  await page.getByRole('button', { name: 'Copy content to clipboard' }).click()
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()

  // Read the real OS clipboard from the main process (the renderer can't — the
  // permission handler blocks navigator.clipboard). The seeded snippet is a
  // Mermaid flowchart, decrypted from the vault before the copy, so seeing its
  // text here confirms load -> decrypt -> copyText -> clipboard end to end.
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toContain('flowchart TD')
  expect(clip).toContain('Encrypted at rest, like every snippet')
})
