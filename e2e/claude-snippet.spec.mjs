import { test, expect } from './fixtures.mjs'

// The seeded Claude prompt carries {{language}} / {{file}} / {{concern}}
// placeholders, so copying it must route through the fill dialog and put the
// RESOLVED text on the clipboard — the whole point of the Claude snippet type.
const CLAUDE_EXAMPLE = 'Example — Claude review prompt'

test('copying a Claude prompt fills its {{variables}} before copying', async ({ app, page }) => {
  await page.getByText(CLAUDE_EXAMPLE).hover()
  await page.getByRole('button', { name: 'Copy to clipboard' }).click()

  // Copy is intercepted by the fill dialog because the prompt has placeholders.
  await expect(page.getByRole('button', { name: 'Copy filled' })).toBeVisible()
  for (const [name, value] of [
    ['language', 'Go'],
    ['file', 'main.go'],
    ['concern', 'data races']
  ]) {
    await page.locator('.fill-row', { hasText: name }).getByRole('textbox').fill(value)
  }
  await page.getByRole('button', { name: 'Copy filled' }).click()

  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(clip).toContain('Review the Go changes in main.go')
  expect(clip).toContain('data races')
  expect(clip).not.toContain('{{') // every placeholder resolved
})
