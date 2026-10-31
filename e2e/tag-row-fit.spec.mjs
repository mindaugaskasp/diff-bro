import { test, expect, openNewSnippet, snippetDoc, docActions } from './fixtures.mjs'

const LONG_TAGS = [
  'infrastructure-platform-engineering',
  'customer-facing-incident-runbooks',
  'kubernetes-production-eu-west-cluster',
  'one-more-tag',
  'and-another-tag'
]

async function openWithTags(page, tags) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill('Tags that fit')
  for (const tag of tags) {
    await doc.locator('.taginput').fill(tag)
    await doc.locator('.taginput').press('Enter')
  }
  await doc.locator('.editor').click()
  await page.keyboard.type('body')
  return doc
}

const pageOverflow = (page) =>
  page.evaluate(() => {
    const { scrollWidth, clientWidth } = document.documentElement
    return scrollWidth - clientWidth
  })

test('long tags cut with an ellipsis and keep Add tag in the window', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 640 })
  await openWithTags(page, LONG_TAGS)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(snippetDoc(page).getByRole('button', { name: 'Add tag' })).toBeVisible()

  const add = await snippetDoc(page).getByRole('button', { name: 'Add tag' }).boundingBox()
  const area = await snippetDoc(page).boundingBox()
  expect(add.x + add.width).toBeLessThanOrEqual(area.x + area.width)
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0)

  const label = snippetDoc(page).locator('.tag-row > .etag .tw-label').first()
  const cut = await label.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(cut).toBe(true)
  await expect(label).toHaveAttribute('data-tip', LONG_TAGS[0])
})

test('+N opens inside the window and gives it no scrollbars', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 640 })
  const doc = await openWithTags(page, LONG_TAGS)
  await doc.locator('.more-chip').click()

  const pop = await page.locator('.tag-more-pop').boundingBox()
  expect(pop.x + pop.width).toBeLessThanOrEqual(1120)
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
})

test('× in the +N list removes that tag, and a press elsewhere closes the list', async ({
  page
}) => {
  const doc = await openWithTags(page, ['aa', 'bb', 'cc', 'dd', 'ee'])
  await doc.locator('.more-chip').click()
  const pop = page.locator('.tag-more-pop')

  await pop.getByRole('button', { name: /dd/ }).click()
  await expect(pop.locator('.etag')).toHaveText(['aa', 'bb', 'cc', 'ee'])
  await expect(pop).toBeVisible()

  await page.mouse.click(640, 500)
  await expect(pop).toBeHidden()

  await doc.locator('.more-chip').click()
  await expect(pop).toBeVisible()
  await doc.locator('.more-chip').click()
  await expect(pop).toBeHidden()
})
