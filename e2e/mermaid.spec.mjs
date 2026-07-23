import { test, expect } from './fixtures.mjs'

// The seeded first-run snippet is a Mermaid diagram. Two real-launch behaviors
// ride on it: the sidebar row opens the diagram in the resizable viewer, and the
// snippet editor shows a live preview. Both decrypt the snippet (vault:decrypt)
// and run Mermaid, which produces an <svg> — jsdom can't render one (no layout,
// no getBBox), so this is the only place the "diagram actually painted" question
// gets a real answer. A past bug shipped an invisible diagram in this very
// viewer; these assertions keep it visible.
test('a Mermaid snippet opens a rendered SVG in the diagram viewer', async ({ page }) => {
  const row = page.getByText('Example — Mermaid diagram')
  await expect(row).toBeVisible() // the seeded example

  // Row actions reveal on hover; hover the name, then open the viewer.
  await row.hover()
  await page.getByRole('button', { name: 'View diagram' }).click()

  const viewer = page.locator('.viewer-backdrop')
  await expect(viewer).toBeVisible()
  // Scope to the diagram host — the viewer's toolbar buttons are AppIcon <svg>s too.
  await expect(viewer.locator('.mermaid-diagram svg').first()).toBeVisible()

  // Escape closes it (the viewer's own key handler, not a BaseDialog).
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
})

test('editing a Mermaid snippet shows a live diagram preview', async ({ page }) => {
  await page.getByText('Example — Mermaid diagram').click()

  const editor = page.getByRole('dialog', { name: 'Edit Snippet' })
  await expect(editor).toBeVisible()
  // The Mermaid-only preview pane renders the decrypted content as an SVG.
  // 'Diagram preview' is exact — the Monaco content also contains the words
  // "Live diagram preview", and the Expand button carries an AppIcon <svg>.
  await expect(editor.getByText('Diagram preview', { exact: true })).toBeVisible()
  await expect(editor.locator('.mmd-preview .mermaid-diagram svg').first()).toBeVisible()
})
