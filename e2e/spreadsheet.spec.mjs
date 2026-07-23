import { test, expect, stubOpenDialog } from './fixtures.mjs'
import { zipSync, strToU8 } from 'fflate'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The spreadsheet path can only be proven by a real launch: .xlsx is a zip that
// the main process must parse to a grid (src/main/xlsx), and the grid viewer
// needs real layout — neither the main-process parse nor the two aligned grids
// exist in a jsdom unit test. So build genuine .xlsx files on disk, open them
// through the (stubbed) native dialog, and assert the grid diff renders.

const XML = '<?xml version="1.0" encoding="UTF-8"?>'
const inlineStr = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`
const num = (ref, v) => `<c r="${ref}"><v>${v}</v></c>`

function buildXlsx(rowsXml) {
  const files = {
    'xl/workbook.xml':
      `${XML}<workbook xmlns:r="r"><sheets>` +
      '<sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      `${XML}<Relationships><Relationship Id="rId1" ` +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
      'Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `${XML}<worksheet><sheetData>${rowsXml}</sheetData></worksheet>`
  }
  const map = {}
  for (const [k, v] of Object.entries(files)) map[k] = strToU8(v)
  return Buffer.from(zipSync(map))
}

// Left: North 120, plus a West row. Right: North 150 (changed cell), West
// replaced by Central (one removed + one added row).
const LEFT = buildXlsx(
  `<row r="1">${inlineStr('A1', 'Region')}${inlineStr('B1', 'Q1')}${inlineStr('C1', 'Q2')}</row>` +
    `<row r="2">${inlineStr('A2', 'North')}${num('B2', 100)}${num('C2', 120)}</row>` +
    `<row r="3">${inlineStr('A3', 'West')}${num('B3', 50)}${num('C3', 60)}</row>`
)
const RIGHT = buildXlsx(
  `<row r="1">${inlineStr('A1', 'Region')}${inlineStr('B1', 'Q1')}${inlineStr('C1', 'Q2')}</row>` +
    `<row r="2">${inlineStr('A2', 'North')}${num('B2', 100)}${num('C2', 150)}</row>` +
    `<row r="3">${inlineStr('A3', 'Central')}${num('B3', 40)}${num('C3', 55)}</row>`
)

test('opens two .xlsx files and renders the aligned grid diff', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-xlsx-'))
  const leftPath = join(dir, 'budget-left.xlsx')
  const rightPath = join(dir, 'budget-right.xlsx')
  writeFileSync(leftPath, LEFT)
  writeFileSync(rightPath, RIGHT)

  try {
    // Open left, then right, through the real file:open -> readXlsx path.
    await stubOpenDialog(app, [leftPath])
    await page.locator('.slot[data-side="left"]').click()
    await expect(page.locator('.slot[data-side="left"] .name')).toHaveText('budget-left.xlsx')

    await stubOpenDialog(app, [rightPath])
    await page.locator('.slot[data-side="right"]').click()

    // The grid viewer took over (not Monaco): its sheet tab is present.
    const tab = page.locator('.sheet-tabs .tab', { hasText: 'Budget' })
    await expect(tab).toBeVisible()
    // Three total changes (1 changed cell-row + 1 added + 1 removed) on the tab.
    await expect(tab.locator('.badge')).toHaveText('3')

    // Both grids painted: the old and new values of the changed cell are shown.
    await expect(page.locator('.grid td.cell-chg', { hasText: '120' })).toBeVisible()
    await expect(page.locator('.grid td.cell-chg', { hasText: '150' })).toBeVisible()

    // The removed and added rows each render with their own row state.
    await expect(page.locator('.grid tr.removed', { hasText: 'West' })).toBeVisible()
    await expect(page.locator('.grid tr.added', { hasText: 'Central' })).toBeVisible()

    // The status strip summarises the same counts the tab badge implies.
    await expect(page.locator('.status .chg')).toHaveText('◆ 1 changed')
    await expect(page.locator('.status .add')).toHaveText('+1 rows')
    await expect(page.locator('.status .del')).toHaveText('−1 rows')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rejects a corrupt .xlsx with a notice instead of loading it', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-xlsx-'))
  const badPath = join(dir, 'broken.xlsx')
  // Valid zip magic so it reaches the parser, but not a real workbook.
  writeFileSync(badPath, Buffer.from(zipSync({ 'junk.txt': strToU8('nope') })))

  try {
    await stubOpenDialog(app, [badPath])
    await page.locator('.slot[data-side="left"]').click()
    // Nothing loads into the slot; a notice explains why.
    await expect(page.locator('.notice')).toContainText('broken.xlsx')
    await expect(page.locator('.slot[data-side="left"] .name')).toHaveCount(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
