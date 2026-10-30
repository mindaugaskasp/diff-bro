import { test, expect, showPanel, openNewSnippet, docActions } from './fixtures.mjs'

const LONG = 'Staging database connection string'

async function pinnedSnippet(page, name) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(name)
  await doc.locator('.editor').click()
  await page.keyboard.insertText('select 1')
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await showPanel(page, 'snippets')
  const row = page.locator('.snippets-section .row', { hasText: name }).first()
  await row.hover()
  await row.locator('.star').click()
}

const tileShape = (tile) =>
  tile.evaluate((el) => {
    const s = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    const well = el.querySelector('.glyph-well').getBoundingClientRect()
    const name = el.querySelector('.row-2-name')
    const label = name.getBoundingClientRect()
    return {
      left: box.left,
      top: box.top,
      height: box.height,
      face: s.backgroundColor,
      shadow: s.boxShadow,
      edge: s.borderTopColor,
      wellAbove: well.bottom <= label.top,
      centred: Math.abs(well.left + well.width / 2 - (box.left + box.width / 2)) < 1,
      nameInside: label.left >= box.left - 0.5 && label.right <= box.right + 0.5,
      cut: name.scrollWidth > name.clientWidth
    }
  })

const rowsOf = (shapes) => new Set(shapes.map((s) => Math.round(s.top))).size

test('Tools is a three-column grid of plain tiles, the icon over its name', async ({ page }) => {
  await showPanel(page, 'tools')
  await page.mouse.move(0, 0)
  const group = page.locator('.tt-group', { hasText: 'Generate' })
  const shapes = await Promise.all(
    (await group.locator('.tt-tile').all()).map((tile) => tileShape(tile))
  )
  expect(shapes).toHaveLength(3)
  expect(rowsOf(shapes)).toBe(1)
  for (const shape of shapes) {
    expect(shape.face).toBe('rgba(0, 0, 0, 0)')
    expect(shape.shadow).toBe('none')
    expect(shape.edge).toBe('rgba(0, 0, 0, 0)')
    expect(shape.wellAbove).toBe(true)
    expect(shape.centred).toBe(true)
  }
})

test('a long pinned name stays on one line inside its tile, full in the tooltip', async ({
  page
}) => {
  await pinnedSnippet(page, 'Restart api')
  await pinnedSnippet(page, LONG)
  await showPanel(page, 'home')
  const pinned = page.locator('.home-pin .tile')
  await expect(pinned).toHaveCount(2)
  const [short, long] = await Promise.all([
    tileShape(pinned.filter({ hasText: 'Restart api' })),
    tileShape(pinned.filter({ hasText: 'Staging' }))
  ])
  expect(long.height).toBe(short.height)
  expect(long.nameInside).toBe(true)
  expect(long.cut).toBe(true)
  await expect(pinned.filter({ hasText: 'Staging' })).toHaveAttribute('data-tip', LONG)

  const quick = page.locator('.home-block', { hasText: 'Quick tools' }).locator('.tile')
  const quickShapes = await Promise.all((await quick.all()).map((tile) => tileShape(tile)))
  expect(rowsOf(quickShapes.slice(0, 3))).toBe(1)
})
