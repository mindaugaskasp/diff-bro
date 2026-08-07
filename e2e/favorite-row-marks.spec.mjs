import { test, expect } from './fixtures.mjs'

// A favourited row marks itself the same way in every section. Snippets lost
// their mark silently: the only rule that drew it was `.shelf.fav .row` in
// SnippetsPanel.css, and the `.shelf` markup it targets was removed when the
// separate favourites shelf went away. Nothing failed, because nothing measured
// the mark — so a starred snippet looked identical to an unstarred one.
//
// Asserted as computed style rather than a screenshot: the bar is a box-shadow
// and the wash is a background, and both are readable off the live DOM.

const marks = (row) =>
  row.evaluate((el) => {
    const s = getComputedStyle(el)
    return { shadow: s.boxShadow, background: s.backgroundColor }
  })

const drawn = (m) =>
  m.shadow !== 'none' && m.shadow !== '' && !/rgba\(0, 0, 0, 0\)/.test(m.background)

async function addSnippet(page, name) {
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type('body text')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

test('a favourited snippet row carries the same mark a pinned tool does', async ({ page }) => {
  await addSnippet(page, 'E2E favourite target')

  const snippets = page.locator('.sidebar-section').filter({ hasText: 'Snippets' })
  const row = snippets.locator('.row').filter({ hasText: 'E2E favourite target' })

  const before = await marks(row)
  expect(drawn(before), 'an unstarred row must NOT be marked').toBe(false)

  await row.locator('.star').click()
  const after = await marks(row)
  expect(drawn(after), 'a starred snippet row must draw the bar and the wash').toBe(true)

  // The consistency the sections owe each other: the same state, the same mark.
  const tools = page.locator('.sidebar-section').filter({ hasText: 'Tools' })
  await tools.locator('.row').first().locator('.star').click()
  const pinnedTool = await marks(tools.locator('.row.pinned').first())

  expect(after.shadow).toBe(pinnedTool.shadow)
  expect(after.background).toBe(pinnedTool.background)
})
