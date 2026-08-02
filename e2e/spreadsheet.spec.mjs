import { test, expect, stubOpenDialog, stubSaveDialog } from './fixtures.mjs'
import { zipSync, strToU8 } from 'fflate'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

function buildXlsx(rowsXml, extra = {}) {
  const files = {
    'xl/workbook.xml':
      `${XML}<workbook xmlns:r="r"><sheets>` +
      '<sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      `${XML}<Relationships><Relationship Id="rId1" ` +
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
      'Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `${XML}<worksheet><sheetData>${rowsXml}</sheetData></worksheet>`,
    ...extra
  }
  const map = {}
  for (const [k, v] of Object.entries(files)) map[k] = strToU8(v)
  return Buffer.from(zipSync(map))
}

// Two files that a values-only diff calls identical: same numbers on screen, but
// the right file's total was pasted over the formula that produced it, and its
// date column is formatted rather than raw.
const STYLES =
  `${XML}<styleSheet><cellXfs>` +
  '<xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/>' +
  '</cellXfs></styleSheet>'
const formulaSheet = (f) =>
  `<row r="1">${num('A1', 45870)}${num('B1', 100)}</row>` +
  `<row r="2" hidden="1">${num('A2', 45871)}${num('B2', 50)}</row>` +
  `<row r="3">${inlineStr('A3', 'Total')}<c r="B3">${f}<v>150</v></c></row>`
const DATED_LEFT = buildXlsx(
  formulaSheet('<f>SUM(B1:B2)</f>').replace(/<c r="A(\d)"/g, '<c r="A$1" s="1"'),
  { 'xl/styles.xml': STYLES }
)
const DATED_RIGHT = buildXlsx(formulaSheet('').replace(/<c r="A(\d)"/g, '<c r="A$1" s="1"'), {
  'xl/styles.xml': STYLES
})

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

// The roadmap's headline spreadsheet bug, end to end: every number on screen is
// the same, so a values-only diff called these files identical.
test('catches a formula overwritten by its own value, and dates as dates', async ({
  app,
  page
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-xlsx-f-'))
  const leftPath = join(dir, 'model-left.xlsx')
  const rightPath = join(dir, 'model-right.xlsx')
  writeFileSync(leftPath, DATED_LEFT)
  writeFileSync(rightPath, DATED_RIGHT)

  try {
    await stubOpenDialog(app, [leftPath])
    await page.locator('.slot[data-side="left"]').click()
    await stubOpenDialog(app, [rightPath])
    await page.locator('.slot[data-side="right"]').click()
    await expect(page.locator('.grids')).toBeVisible()

    // styles.xml is read, so the serial renders as a date rather than 45870.
    await expect(page.locator('.grid td', { hasText: '2025-08-01' }).first()).toBeVisible()
    await expect(page.locator('.grid td', { hasText: '45870' })).toHaveCount(0)

    // The formula cell is marked, and the one whose formula went away is flagged
    // even though both sides still read 150.
    await expect(page.locator('.grid td.has-f')).toHaveCount(1)
    await expect(page.locator('.grid td.cell-fchg').first()).toHaveText('150')
    await expect(page.locator('.status .chg')).toHaveText('◆ 1 changed')

    // Hidden row 2 is compared, and its gutter says where it came from.
    await expect(page.locator('.grid tr.row-hidden')).toHaveCount(2)

    // Formulas view swaps results for the expressions behind them.
    await page.getByRole('button', { name: 'Formulas' }).click()
    await expect(page.locator('.grid td', { hasText: '=SUM(B1:B2)' })).toBeVisible()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// An inserted column used to shift every column after it, and float noise was
// indistinguishable from an edit.
const COL_LEFT = buildXlsx(
  `<row r="1">${inlineStr('A1', 'Region')}${inlineStr('B1', 'Q1')}${inlineStr('C1', 'Q2')}</row>` +
    `<row r="2">${inlineStr('A2', 'North')}${num('B2', 100)}${num('C2', 120)}</row>` +
    `<row r="3">${inlineStr('A3', 'South')}${num('B3', 70)}${num('C3', 90)}</row>`
)
const COL_RIGHT = buildXlsx(
  `<row r="1">${inlineStr('A1', 'Region')}${inlineStr('B1', 'Q1')}` +
    `${inlineStr('C1', 'Forecast')}${inlineStr('D1', 'Q2')}</row>` +
    `<row r="2">${inlineStr('A2', 'North')}${num('B2', 100)}${num('C2', 111)}${num('D2', 120)}</row>` +
    `<row r="3">${inlineStr('A3', 'South')}${num('B3', 70)}${num('C3', 88)}${num('D3', 90.004)}</row>`
)

test('aligns columns across an insert and forgives sub-material noise', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-xlsx-c-'))
  const leftPath = join(dir, 'cols-left.xlsx')
  const rightPath = join(dir, 'cols-right.xlsx')
  writeFileSync(leftPath, COL_LEFT)
  writeFileSync(rightPath, COL_RIGHT)

  try {
    await stubOpenDialog(app, [leftPath])
    await page.locator('.slot[data-side="left"]').click()
    await stubOpenDialog(app, [rightPath])
    await page.locator('.slot[data-side="right"]').click()
    await expect(page.locator('.grids')).toBeVisible()

    // The inserted column is reported once, and Q2 still lines up with Q2 —
    // only the 90 -> 90.004 cell reads as changed, not every cell after B.
    await expect(page.locator('.status .cols')).toHaveText('⇄ 1 column')
    await expect(page.locator('.status .chg')).toHaveText('◆ 1 changed')
    await expect(page.locator('.grid thead th.col-added')).toHaveCount(1)
    // The left grid has no such column, so it shows a striped gap.
    await expect(page.locator('.grid thead th.ghost-col')).toHaveCount(1)

    // A 0.004 difference is below a 0.01 tolerance: nothing material is left.
    await page.locator('.seg-opt', { hasText: '±0.01' }).click()
    await expect(page.locator('.status .chg')).toHaveText('◆ 0 changed')
    await expect(page.locator('.status .cols')).toHaveText('⇄ 1 column')

    // A threshold of your own — the field only exists once Custom is picked, and
    // an empty one compares exactly rather than forgiving everything.
    await page.locator('.seg-opt', { hasText: 'Custom' }).click()
    const value = page.getByLabel('Custom tolerance')
    const unit = (name) => page.getByRole('group', { name: 'Unit' }).getByRole('button', { name })
    await expect(value).toBeVisible()
    await expect(page.locator('.status .chg')).toHaveText('◆ 1 changed')

    // 0.004 of 90 is ~0.0044%, so a raw 0.001 leaves it changed and 0.01 does not.
    await unit('abs').click()
    await value.fill('0.001')
    await expect(page.locator('.status .chg')).toHaveText('◆ 1 changed')
    await value.fill('0.01')
    await expect(page.locator('.status .chg')).toHaveText('◆ 0 changed')

    // ...and as a percentage, which is what materiality actually means.
    await unit('%').click()
    await value.fill('0.001')
    await expect(page.locator('.status .chg')).toHaveText('◆ 1 changed')
    await value.fill('0.01')
    await expect(page.locator('.status .chg')).toHaveText('◆ 0 changed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('exports the change register as a CSV', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-xlsx-reg-'))
  const leftPath = join(dir, 'cols-left.xlsx')
  const rightPath = join(dir, 'cols-right.xlsx')
  const out = join(dir, 'register.csv')
  writeFileSync(leftPath, COL_LEFT)
  writeFileSync(rightPath, COL_RIGHT)

  try {
    await stubOpenDialog(app, [leftPath])
    await page.locator('.slot[data-side="left"]').click()
    await stubOpenDialog(app, [rightPath])
    await page.locator('.slot[data-side="right"]').click()
    await expect(page.locator('.grids')).toBeVisible()

    await stubSaveDialog(app, out)
    await page.getByRole('button', { name: 'Register' }).click()
    await expect(page.locator('.notice')).toContainText('Exported')

    const csv = readFileSync(out, 'utf8')
    expect(csv.split('\r\n')[0]).toBe('Sheet,Cell,Column,Change,Before,After')
    expect(csv).toContain('Column added')
    expect(csv).toContain('Forecast')
    // The changed cell, reported at its own A1 reference on each side.
    expect(csv).toContain('Q2,Value,90,90.004')
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

// The grid scrolls inside itself with no Monaco behind it. It registers its own
// scroller, so the export scrolls and stitches it the same way it does a tall
// diff — capturePage only ever sees what is composited, whatever the viewer.
test('exports the spreadsheet grid as a stitched picture', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-xlsx-img-'))
  const leftPath = join(dir, 'budget-left.xlsx')
  const rightPath = join(dir, 'budget-right.xlsx')
  writeFileSync(leftPath, LEFT)
  writeFileSync(rightPath, RIGHT)
  try {
    await stubOpenDialog(app, [leftPath])
    await page.locator('.slot[data-side="left"]').click()
    await stubOpenDialog(app, [rightPath])
    await page.locator('.slot[data-side="right"]').click()
    await expect(page.locator('.grids')).toBeVisible()

    const image = page.getByRole('button', { name: /^Capture/ })
    await expect(image).toBeEnabled()
    await image.click()

    // A real picture of the grid, not a placeholder: the preview carries PNG
    // bytes and the dialog reports the size it actually captured.
    const shot = page.locator('.shot img')
    await expect(shot).toBeVisible()
    await expect(shot).toHaveAttribute('src', /^data:image\/png;base64,/)
    await expect(page.locator('.dialog-note').first()).toContainText(/\d+ × \d+ screenshot/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
