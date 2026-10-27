import { test, expect, openNewSnippet, snippetDoc, editInPlace } from './fixtures.mjs'

const boxes = (doc) =>
  doc.locator('.tag-row .tag-chip, .tag-row .add-pill').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
    })
  )

test('entering edit mode moves and resizes no tag pill', async ({ page }) => {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Steady pills')
  for (const tag of ['alpha', 'beta']) {
    await editor.locator('.taginput').fill(tag)
    await editor.locator('.taginput').press('Enter')
  }
  await editor.locator('.editor').click()
  await page.keyboard.type('body')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()

  const doc = snippetDoc(page)
  const before = await boxes(doc)
  expect(before).toHaveLength(3)
  await editInPlace(page)
  expect(await boxes(doc)).toEqual(before)
})
