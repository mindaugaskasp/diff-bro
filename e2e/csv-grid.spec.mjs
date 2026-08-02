import { test, expect, stubOpenDialog } from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A .csv is a text file until the reader asks for the grid, and the grid it then
// gets is the spreadsheet viewer — two aligned tables with real layout. Neither
// half of that (the toggle routing a text comparison to another viewer, the
// grids sizing themselves) exists in a jsdom unit test.

const LEFT = 'id,region,qty\n1,North,100\n2,West,50\n'
const RIGHT = 'id,region,qty\n1,North,140\n3,Central,70\n'

async function loadPair(app, page, { left, right, ext = 'csv' }) {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-csv-'))
  const leftPath = join(dir, `a.${ext}`)
  const rightPath = join(dir, `b.${ext}`)
  writeFileSync(leftPath, left)
  writeFileSync(rightPath, right)
  await stubOpenDialog(app, [leftPath])
  await page.locator('.slot[data-side="left"]').click()
  await stubOpenDialog(app, [rightPath])
  await page.locator('.slot[data-side="right"]').click()
  return dir
}

test('a CSV pair compares as text until the Grid toggle turns it into a grid', async ({
  app,
  page
}) => {
  const dir = await loadPair(app, page, { left: LEFT, right: RIGHT })
  try {
    // The toggle names the view it gives, and the comparison is still text.
    const toggle = page.locator('.options label', { hasText: 'Grid' })
    await expect(toggle).toBeVisible()
    await expect(page.locator('.grids')).toHaveCount(0)

    await toggle.locator('input').check()

    // Both grids painted, as one paired sheet rather than two one-sided ones.
    await expect(page.locator('.grids')).toBeVisible()
    await expect(page.locator('.sheet-tabs .tab')).toHaveCount(1)

    // The changed quantity is flagged per cell, not per line.
    await expect(page.locator('.grid td.cell-chg', { hasText: '100' })).toBeVisible()
    await expect(page.locator('.grid td.cell-chg', { hasText: '140' })).toBeVisible()

    // Rows are aligned by their key column: West left, Central added.
    await expect(page.locator('.grid tr.removed', { hasText: 'West' })).toBeVisible()
    await expect(page.locator('.grid tr.added', { hasText: 'Central' })).toBeVisible()
    await expect(page.locator('.status .chg')).toHaveText('◆ 1 changed')

    // Turning it off hands the comparison back to the text viewer.
    await toggle.locator('input').uncheck()
    await expect(page.locator('.grids')).toHaveCount(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Quoted fields are the reason a CSV cannot be split on commas by eye: the
// delimiter inside the quotes must not become a column break.
test('keeps a quoted delimiter inside its cell', async ({ app, page }) => {
  const dir = await loadPair(app, page, {
    left: 'name,note\n"Doe, Jane",ok\n',
    right: 'name,note\n"Doe, Jane",changed\n'
  })
  try {
    await page.locator('.options label', { hasText: 'Grid' }).locator('input').check()
    await expect(page.locator('.grid td', { hasText: 'Doe, Jane' }).first()).toBeVisible()
    // Two data columns, not three — the comma inside the quotes stayed put.
    await expect(page.locator('.grid').first().locator('thead th')).toHaveCount(3)
    await expect(page.locator('.grid td.cell-chg', { hasText: 'changed' })).toBeVisible()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('offers no grid when only one side is delimited', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-csv-'))
  const csvPath = join(dir, 'a.csv')
  const txtPath = join(dir, 'b.txt')
  writeFileSync(csvPath, LEFT)
  writeFileSync(txtPath, LEFT)
  try {
    await stubOpenDialog(app, [csvPath])
    await page.locator('.slot[data-side="left"]').click()
    await stubOpenDialog(app, [txtPath])
    await page.locator('.slot[data-side="right"]').click()
    await expect(page.locator('.options label', { hasText: 'Grid' })).toHaveCount(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
