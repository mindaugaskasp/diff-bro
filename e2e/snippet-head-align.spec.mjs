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

const addTags = async (doc, tags) => {
  const input = doc.getByRole('textbox', { name: 'Add tag' })
  for (const tag of tags) {
    await input.fill(tag)
    await input.press('Enter')
  }
}

test('three tags show, and the rest wait behind a +N that lists them all', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  const head = doc.locator('.doc-head')
  const more = head.getByRole('button', { name: /more tags/ })

  await addTags(doc, ['alpha', 'bravo', 'charlie'])
  await expect(head.locator('.etag:visible')).toHaveCount(3)
  await expect(more).toHaveCount(0)

  await addTags(doc, ['delta', 'echo', 'foxtrot', 'golf', 'hotel-long-tag-name'])
  expect((await head.boundingBox()).height).toBe(49)
  await expect(head.locator('.tag-row > .etag:visible')).toHaveCount(3)
  await expect(more).toHaveText('+5')
  await more.click()
  const all = page.getByRole('group', { name: 'All tags' })
  await expect(all.locator('.etag')).toHaveCount(8)
  await expect(all).toContainText('hotel-long-tag-name')
})

test('the bar is a quiet title over its tags, part of the document', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill('Release checklist')
  await addTags(doc, ['alpha'])
  const shape = await doc.locator('.doc-head').evaluate((head) => {
    const input = head.querySelector('.doc-name input')
    const css = getComputedStyle(input)
    const dot = head.querySelector('.tw-dot').getBoundingClientRect()
    const name = input.getBoundingClientRect()
    const field = head.querySelector('.ghost-field')
    const editor = head.parentElement.querySelector('.editor .monaco-editor')
    return {
      size: css.fontSize,
      weight: css.fontWeight,
      tagsBelow: dot.top >= name.bottom - 1,
      dotOffset: Math.abs(dot.left - (name.left + parseFloat(css.paddingLeft))),
      rule: getComputedStyle(head).borderBottomWidth,
      sameGround:
        getComputedStyle(head).backgroundColor === getComputedStyle(editor).backgroundColor,
      fieldEdge: getComputedStyle(field).borderTopColor
    }
  })
  expect(shape).toMatchObject({
    size: '13px',
    weight: '600',
    tagsBelow: true,
    rule: '0px',
    sameGround: true
  })
  expect(shape.dotOffset).toBeLessThanOrEqual(1)
})

test('a tag is a dot and a word, not a filled pill', async ({ page }) => {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await addTags(doc, ['alpha'])
  const tag = doc.locator('.tag-row > .etag')
  await expect(tag).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(tag).toHaveCSS('font-weight', '400')
  await expect(tag.locator('.tw-dot')).toBeVisible()
})

for (const width of [1280, 900]) {
  test(`the add-tag popup stays in a ${width}px window`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await openNewSnippet(page)
    const doc = page.getByRole('region', { name: 'New snippet' })
    await addTags(doc, ['release', 'infra-prod', 'claude', 'example', 'security', 'docs'])
    await doc.getByRole('textbox', { name: 'Add tag' }).focus()
    const pop = doc.locator('.tag-pop')
    await expect(pop).toBeVisible()
    const box = await pop.boundingBox()
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    const overflow = await page.evaluate(() => {
      const root = document.scrollingElement
      return root.scrollWidth - root.clientWidth
    })
    expect(overflow).toBe(0)
  })
}

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

  await name.fill(`${'A very long standup title that fills the whole field '.repeat(3)}{{today}}`)
  await expect(hint).toBeHidden()

  await doc.locator('.editor').click()
  await page.keyboard.type('some content')
  await name.fill('')
  await expect(doc.getByPlaceholder('A snippet needs a name to save.')).toBeVisible()
  await expect(doc.locator('.doc-name .ghost-field')).toHaveClass(/invalid/)
})
