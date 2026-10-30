import { test, expect, openMenu, showPanel } from './fixtures.mjs'

const paint = (locator) =>
  locator.evaluate((el) => {
    const s = getComputedStyle(el)
    return { face: s.backgroundColor, edge: s.borderTopColor }
  })

async function expectHoverChanges(page, locator, parts) {
  await page.mouse.move(0, 0)
  const rest = await paint(locator)
  await locator.hover()
  for (const part of parts) {
    await expect
      .poll(async () => (await paint(locator))[part], { message: part })
      .not.toBe(rest[part])
  }
}

test('a tile gains a face on hover', async ({ page }) => {
  await showPanel(page, 'tools')
  await expectHoverChanges(page, page.locator('.tt-tile').first(), ['face'])
})

test('a text toggle gains a face on hover', async ({ page }) => {
  await showPanel(page, 'diffs')
  await expectHoverChanges(page, page.locator('.whose-opt:not(.on)'), ['face'])

  await openMenu(page, 'Tools', 'Format', 'JSON')
  await page.getByRole('dialog', { name: 'JSON' }).getByRole('textbox').first().fill('{"a":1}')
  await expectHoverChanges(
    page,
    page.getByRole('dialog', { name: 'JSON' }).locator('.seg-opt:not(.on)').first(),
    ['face']
  )
})
