import { test, expect, showPanel, openNewSnippet } from './fixtures.mjs'

const bottomOf = async (locator) => {
  const box = await locator.boundingBox()
  return Math.round(box.y + box.height)
}
const topBand = (page) => page.locator('.usb-controls:visible')

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 860 })
})

test('the snippet head ends on the sidebar search band', async ({ page }) => {
  await showPanel(page, 'snippets')
  await page.locator('.snippets-section .row').first().click()
  const doc = page.getByRole('region', { name: 'Snippet', exact: true })
  const head = await bottomOf(doc.locator('.doc-head'))
  await showPanel(page, 'home')
  expect(head).toBe(await bottomOf(topBand(page)))
})

test('the comparison file slots end on the sidebar top band', async ({ page }) => {
  await showPanel(page, 'diffs')
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('a')
  await page.getByPlaceholder('Paste or type the changed text').fill('b')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await showPanel(page, 'home')

  expect(await bottomOf(page.locator('.file-slots-row'))).toBe(await bottomOf(topBand(page)))
})

test('tags that do not fit fold into a +N chip that lists them', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  const input = doc.getByRole('textbox', { name: 'Add tag' })
  for (const tag of ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']) {
    await input.fill(`${tag}-long-tag-name`)
    await input.press('Enter')
  }
  const head = doc.locator('.doc-head')
  expect((await head.boundingBox()).height).toBe(49)

  const more = head.getByRole('button', { name: /more tags/ })
  await expect(more).toBeVisible()
  await more.click()
  await expect(page.getByRole('group', { name: 'All tags' })).toContainText('hotel-long-tag-name')
})

test('"Saves as" sits inside the name field, and an empty name says it needs one', async ({
  page
}) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  const name = doc.getByPlaceholder('Snippet name…')
  await name.fill('Standup {{today}}')

  const hint = doc.locator('.name-templates')
  await expect(hint).toBeVisible()
  const field = await doc.locator('.doc-name .ghost-field').boundingBox()
  const box = await hint.boundingBox()
  expect(box.y).toBeGreaterThanOrEqual(field.y)
  expect(box.y + box.height).toBeLessThanOrEqual(field.y + field.height)
  expect(box.x + box.width).toBeLessThanOrEqual(field.x + field.width)

  await name.fill(`A very long standup title that fills the whole field {{today}}`)
  await expect(hint).toBeHidden()

  await doc.locator('.editor').click()
  await page.keyboard.type('some content')
  await name.fill('')
  await expect(doc.getByPlaceholder('A snippet needs a name to save.')).toBeVisible()
  await expect(doc.locator('.doc-name .ghost-field')).toHaveClass(/invalid/)
})
