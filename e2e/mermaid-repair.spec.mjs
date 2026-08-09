import { test, expect, newSnippetButton } from './fixtures.mjs'

// Only a real launch has Mermaid's parser, so "the diagram was broken and now
// renders" can only be answered here. The input is exactly what Word and
// Confluence produce: an em-dash arrow and a non-breaking space, neither of
// which looks wrong in an editor.
const BROKEN = 'flowchart TD\n \u00a0A[Start] \u2014> B[End]\n  B --> C[Done]'

test('a diagram broken by a paste is repaired by its own button', async ({ page }) => {
  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Pasted flow')
  await editor.locator('.editor').click()
  await page.keyboard.insertText(BROKEN)

  // Mermaid is picked up by detection, and the preview reports the damage.
  await expect(editor.getByText('Diagram preview', { exact: true })).toBeVisible()
  await expect(editor.locator('.mmd-preview .err')).toBeVisible()
  await expect(editor.locator('.mmd-preview .mermaid-diagram svg')).toHaveCount(0)

  // The editor's own button, named for what it does to a diagram.
  const repair = editor.getByRole('button', { name: 'Repair', exact: true })
  await expect(repair).toBeEnabled()
  await repair.click()

  await expect(page.getByText('Repaired the diagram.')).toBeVisible()
  await expect(editor.locator('.mmd-preview .mermaid-diagram svg').first()).toBeVisible()
  await expect(editor.locator('.mmd-preview .err')).toHaveCount(0)

  // Pressing it again has nothing left to do, and says so rather than going quiet.
  await repair.click()
  await expect(page.getByText('Nothing to repair.')).toBeVisible()
})

// The repair must reach the STORED source, not just the picture — what gets
// pasted into a ticket is the text.
test('the repair is what gets saved', async ({ app, page }) => {
  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Saved flow')
  await editor.locator('.editor').click()
  await page.keyboard.insertText(BROKEN)
  await editor.getByRole('button', { name: 'Repair', exact: true }).click()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()

  // Reopened from the row, so what is copied comes from the STORE rather than
  // from the buffer the editor still had in hand.
  await page.locator('.snippets-section .row', { hasText: 'Saved flow' }).locator('.entry').click()
  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await expect(view).toBeVisible()
  await app.evaluate(({ clipboard }) => clipboard.clear())
  const copy = view.getByRole('button', { name: 'Copy', exact: true })
  await copy.click()
  // The NAME is stable across the flash — only the visible word swaps — so the
  // acknowledgement is read off the text, not off a second accessible name.
  await expect(copy).toHaveText(/Copied/)

  const saved = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(saved).toContain('A[Start] --> B[End]')
  expect(saved).not.toContain('\u2014')
  expect(saved).not.toContain('\u00a0')
})
