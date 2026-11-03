import { test, expect, showPanel, openNewSnippet } from './fixtures.mjs'

test.beforeEach(async ({ page }) => {
  await showPanel(page, 'snippets')
})

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
  await page.locator('aside.saved').getByText('Example — Mermaid diagram').first().click()

  // Existing snippets open read-only ("Snippet"); the preview renders here too.
  const editor = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(editor).toBeVisible()
  // The Mermaid-only preview pane renders the decrypted content as an SVG.
  // 'Diagram preview' is exact — the Monaco content also contains the words
  // "Live diagram preview", and the Expand button carries an AppIcon <svg>.
  await expect(editor.getByText('Diagram preview', { exact: true })).toBeVisible()
  await expect(editor.locator('.mmd-preview .mermaid-diagram svg').first()).toBeVisible()
})

test('dragging the preview up makes the diagram bigger', async ({ page }) => {
  await page.locator('aside.saved').getByText('Example — Mermaid diagram').first().click()
  const preview = page.locator('.snippet-doc:visible .mmd-preview')
  const svg = preview.locator('.mermaid-diagram svg').first()
  await expect(svg).toBeVisible()
  const bodyHeight = () => preview.locator('.mmd-preview-body').evaluate((el) => el.offsetHeight)
  const svgHeight = async () => (await svg.boundingBox()).height
  const before = { body: await bodyHeight(), svg: await svgHeight() }

  const grip = preview.getByRole('separator', { name: 'Drag to resize the preview' })
  const box = await grip.boundingBox()
  const x = box.x + box.width / 2
  const y = Math.round(box.y + box.height / 2)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 150, { steps: 5 })
  await page.mouse.up()

  await expect.poll(bodyHeight).toBe(before.body + 150)
  await expect.poll(svgHeight).toBeGreaterThan(before.svg)
})

test('an invalid diagram shows its error in the preview, not the error dialog', async ({
  page
}) => {
  await openNewSnippet(page)
  await page.getByRole('region', { name: 'New snippet' }).locator('.editor').click()
  await page.keyboard.insertText('flowchart T')
  await expect(page.locator('.mmd-preview .err')).toContainText('Lexical error')
  await expect(page.getByRole('dialog', { name: 'Something went wrong' })).toHaveCount(0)
})
