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

// At its old 460px minimum the editor needed 578px of content, so it scrolled
// the moment it was dragged small — with the code area squeezed to 160px.
test('the editor never scrolls at its smallest allowed size', async ({ page }) => {
  await page.getByRole('button', { name: 'New snippet' }).click()
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

  await page.getByRole('button', { name: 'New snippet' }).click()
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
