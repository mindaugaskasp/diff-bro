import { test, expect, newSnippetButton } from './fixtures.mjs'

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

// At its old 460px minimum the editor needed 578px of content, so it scrolled
// the moment it was dragged small — with the code area squeezed to 160px.
test('the editor never scrolls at its smallest allowed size', async ({ page }) => {
  await newSnippetButton(page).click()
  const dlg = page.getByRole('dialog', { name: 'New Snippet' })
  await expect(dlg).toBeVisible()

  // The declared minimum from SnippetEditorDialog's :min-size — the smallest
  // the resize handles will ever produce.
  await dlg.evaluate((el) => {
    el.style.width = '420px'
    el.style.height = '620px'
  })
  const at = await dlg.evaluate((el) => ({
    overflowY: el.scrollHeight - el.clientHeight,
    overflowX: el.scrollWidth - el.clientWidth,
    editorH: Math.round(el.querySelector('.editor-area').getBoundingClientRect().height)
  }))
  expect(at.overflowY).toBe(0)
  expect(at.overflowX).toBe(0)
  // And the code area is still worth typing into.
  expect(at.editorH).toBeGreaterThanOrEqual(180)
})

// The row is a handle, and it has to say so before you try to pick it up. A
// SECRET snippet is not draggable at all — its body must never reach a diff
// pane — so it must not offer the handle either.
test('a draggable row shows a grab handle, a secret one does not', async ({ page }) => {
  const ordinary = page.locator('.row[draggable="true"]').first()
  await expect(ordinary).toBeVisible()
  expect(await ordinary.evaluate((el) => getComputedStyle(el).cursor)).toBe('grab')
  // Its own buttons stay buttons.
  expect(
    await ordinary
      .locator('button')
      .first()
      .evaluate((el) => getComputedStyle(el).cursor)
  ).toBe('pointer')

  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Vault token')
  await editor.locator('.editor').click()
  await page.keyboard.type('token=abc123')
  await editor.getByRole('checkbox', { name: /secret/i }).check()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()

  const secret = page.locator('.row', { hasText: 'Vault token' }).first()
  await expect(secret).toHaveAttribute('draggable', 'false')
  expect(await secret.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('grab')
})

// The section header's "+" is the section's one affirmative action, but it
// inherited .btn-icon's flat ROW treatment: at --text-dim it scored 2.82 on
// sepia and 2.92 on nord against the header band, under the 3:1 floor. Row
// actions stay dim — a plate on every one would make the sidebar heavy.
test('the section add button is inked, and row actions are not', async ({ page }) => {
  const add = page.locator('.actions-slot .btn-icon').first()
  await expect(add).toBeVisible()
  const [headerInk, rowInk] = await Promise.all([
    add.evaluate((el) => getComputedStyle(el).color),
    page
      .locator('.row .row-btn')
      .first()
      .evaluate((el) => getComputedStyle(el).color)
  ])
  expect(headerInk).not.toBe(rowInk)
})

// An empty section has no rows to compete with, so it carries the real button —
// the cold-start case: open the app, want to add something.
test('an empty section offers a real button, a populated one does not', async ({ page }) => {
  // Saved diffs starts empty; Snippets ships seeded examples.
  const cta = page.locator('.empty-cta .btn-primary')
  await expect(cta).toBeVisible()
  const snippets = page.locator('.sidebar-section', { hasText: 'Snippets' }).first()
  await expect(snippets).toHaveCount(1)
  await expect(snippets.locator('.empty-cta')).toHaveCount(0)

  // The whole point is that it is clickable at cold start, which a DOM count
  // does not establish — a collapsed section still counts 1.
  const tabsBefore = await page.locator('.tab').count()
  await cta.click()
  await expect(page.locator('.tab')).toHaveCount(tabsBefore + 1)
  await expect(page.locator('.paste-pane, .paste-input, textarea').first()).toBeVisible()
})

// The hover card is where "is this the one?" gets answered — Copy finishes the
// thought there, with the FULL contents (the card's text is truncated).
test('the preview card copies the snippet without a trip back to the row', async ({
  app,
  page
}) => {
  await page.locator('.snippets-section .row', { hasText: 'Example — Mermaid diagram' }).hover()
  const card = page.locator('.preview')
  await expect(card).toBeVisible()

  await app.evaluate(({ clipboard }) => clipboard.clear())
  const copy = card.getByRole('button', { name: 'Copy', exact: true })
  await copy.click()
  // aria-label pins the accessible name to "Copy" (the stable-name pattern the
  // editor's copy buttons follow), so the flash is asserted on the visible text.
  await expect(copy).toHaveText(/Copied/)

  const copied = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(copied).toContain('flowchart TD')
  expect(copied.length).toBeGreaterThan(0)
})
