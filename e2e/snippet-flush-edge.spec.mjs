import { test, expect, showPanel } from './fixtures.mjs'

async function openExample(page) {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).first().click()
  const doc = page.locator('.snippet-doc:visible')
  await expect(doc).toBeVisible()
  return doc
}

const box = (locator) => locator.evaluate((el) => el.getBoundingClientRect().toJSON())

test('the snippet document ends flush with the window, like every other column', async ({
  page
}) => {
  const doc = await openExample(page)
  const status = await box(doc.locator('.editor-status'))
  const viewport = await page.evaluate(() => window.innerHeight)
  expect(Math.round(status.bottom)).toBe(viewport)

  const main = await box(doc.locator('.doc-main'))
  const editor = await box(doc.locator('.editor-area'))
  expect(Math.round(editor.left)).toBe(Math.round(main.left))
  expect(Math.round(status.right)).toBe(Math.round(main.right))
})

test('with no frame left, the click-to-edit cue is a ring drawn over the code', async ({
  page
}) => {
  const doc = await openExample(page)
  const editor = doc.locator('.editor-area .editor')
  expect(await editor.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px')
  await doc.locator('.editor-area').hover()
  await expect.poll(() => editor.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid')
})
