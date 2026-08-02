import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { readXlsx } from '../../../src/main/xlsx/index'
import { extractXlsxEntries, isAllowedEntry } from '../../../src/main/xlsx/unzip'
import { colToIndex, resolveTarget } from '../../../src/main/xlsx/parse'
import { resolveCellValue } from '../../../src/main/xlsx/sheet'

const XML = '<?xml version="1.0" encoding="UTF-8"?>'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'

// Build a real .xlsx buffer from XML parts via fflate — no binary fixture on
// disk, and it exercises the actual unzip path.
function buildXlsx(parts) {
  const files = {}
  for (const [name, xml] of Object.entries(parts)) files[name] = strToU8(xml)
  return Buffer.from(zipSync(files))
}

function workbook(sheets) {
  const rows = sheets
    .map((s, i) => `<sheet name="${s}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')
  return `${XML}<workbook xmlns:r="r"><sheets>${rows}</sheets></workbook>`
}
function rels(targets) {
  const r = targets
    .map((t, i) => `<Relationship Id="rId${i + 1}" Type="${REL}" Target="${t}"/>`)
    .join('')
  return `${XML}<Relationships>${r}</Relationships>`
}
function sst(items) {
  return `${XML}<sst>${items.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`
}
function sheet(body) {
  return `${XML}<worksheet><sheetData>${body}</sheetData></worksheet>`
}

// A canonical one-sheet workbook: two string cells, a number, and a formula
// cell whose cached value must be read but whose <f> must never be.
function sampleWorkbook(extra = {}) {
  return buildXlsx({
    'xl/workbook.xml': workbook(['Budget']),
    'xl/_rels/workbook.xml.rels': rels(['worksheets/sheet1.xml']),
    'xl/sharedStrings.xml': sst(['Region', 'North']),
    'xl/worksheets/sheet1.xml': sheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>100</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><f>B1+50</f><v>150</v></c></row>'
    ),
    ...extra
  })
}

describe('readXlsx — happy path', () => {
  it('extracts rows with shared strings, numbers, and cached formula values', () => {
    const { sheets } = readXlsx(sampleWorkbook())
    expect(sheets).toHaveLength(1)
    expect(sheets[0].name).toBe('Budget')
    expect(sheets[0].rows).toEqual([
      ['Region', 100],
      ['North', 150]
    ])
  })

  it('maps sheet names to worksheets through the rels, respecting order', () => {
    const buf = buildXlsx({
      'xl/workbook.xml': workbook(['First', 'Second']),
      // rId1 -> sheet2.xml, rId2 -> sheet1.xml: order comes from rels, not names
      'xl/_rels/workbook.xml.rels': rels(['worksheets/sheet2.xml', 'worksheets/sheet1.xml']),
      'xl/sharedStrings.xml': sst(['a', 'b']),
      'xl/worksheets/sheet1.xml': sheet('<row r="1"><c r="A1" t="s"><v>1</v></c></row>'),
      'xl/worksheets/sheet2.xml': sheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>')
    })
    const { sheets } = readXlsx(buf)
    expect(sheets.map((s) => s.name)).toEqual(['First', 'Second'])
    expect(sheets[0].rows).toEqual([['a']]) // First -> rId1 -> sheet2 -> shared[0]
    expect(sheets[1].rows).toEqual([['b']]) // Second -> rId2 -> sheet1 -> shared[1]
  })

  it('reads inline strings, booleans, and leaves gaps as null', () => {
    const buf = sampleWorkbook({
      'xl/worksheets/sheet1.xml': sheet(
        '<row r="1">' +
          '<c r="A1" t="inlineStr"><is><t>Hi</t></is></c>' +
          '<c r="C1" t="b"><v>1</v></c>' + // B1 skipped -> null gap
          '</row>'
      )
    })
    expect(readXlsx(buf).sheets[0].rows).toEqual([['Hi', null, true]])
  })

  it('works with no sharedStrings part', () => {
    const buf = buildXlsx({
      'xl/workbook.xml': workbook(['S']),
      'xl/_rels/workbook.xml.rels': rels(['worksheets/sheet1.xml']),
      'xl/worksheets/sheet1.xml': sheet('<row r="1"><c r="A1"><v>42</v></c></row>')
    })
    expect(readXlsx(buf).sheets[0].rows).toEqual([[42]])
  })
})

describe('readXlsx — formulas', () => {
  it('captures the formula text and its R1C1 normal form', () => {
    const { sheets } = readXlsx(sampleWorkbook())
    // B2 (row 1, col 1) holds =B1+50, one row above itself.
    expect(sheets[0].cells).toEqual([[1, 1, { f: 'B1+50', n: 'R[-1]C+50' }]])
    // The cached value is still what the grid compares.
    expect(sheets[0].rows[1][1]).toBe(150)
  })

  it('expands a shared formula onto every follower cell', () => {
    const buf = sampleWorkbook({
      'xl/worksheets/sheet1.xml': sheet(
        '<row r="1"><c r="A1"><v>1</v></c>' +
          '<c r="B1"><f t="shared" si="0" ref="B1:B2">A1*2</f><v>2</v></c></row>' +
          '<row r="2"><c r="A2"><v>3</v></c>' +
          '<c r="B2"><f t="shared" si="0"/><v>6</v></c></row>'
      )
    })
    const [{ cells }] = readXlsx(buf).sheets
    expect(cells).toEqual([
      [0, 1, { f: 'A1*2', n: 'RC[-1]*2' }],
      [1, 1, { f: 'A2*2', n: 'RC[-1]*2' }]
    ])
  })

  it('caps a pathologically long formula instead of holding it whole', () => {
    const long = `A1+${'1+'.repeat(600)}1`
    const buf = sampleWorkbook({
      'xl/worksheets/sheet1.xml': sheet(`<row r="1"><c r="A1"><f>${long}</f><v>1</v></c></row>`)
    })
    const [{ cells }] = readXlsx(buf).sheets
    expect(cells[0][2].f.length).toBeLessThanOrEqual(400)
  })

  it('marks an error cell so it never reads as ordinary text', () => {
    const buf = sampleWorkbook({
      'xl/worksheets/sheet1.xml': sheet('<row r="1"><c r="A1" t="e"><v>#REF!</v></c></row>')
    })
    const [{ rows, cells }] = readXlsx(buf).sheets
    expect(rows).toEqual([['#REF!']])
    expect(cells).toEqual([[0, 0, { e: true }]])
  })
})

describe('readXlsx — number formats', () => {
  const styles = (codes) =>
    `${XML}<styleSheet><numFmts>` +
    codes.custom.map((c, i) => `<numFmt numFmtId="${164 + i}" formatCode="${c}"/>`).join('') +
    '</numFmts><cellStyleXfs><xf numFmtId="0"/></cellStyleXfs><cellXfs>' +
    codes.xfs.map((id) => `<xf numFmtId="${id}" applyNumberFormat="1"/>`).join('') +
    '</cellXfs></styleSheet>'

  it('renders a date-formatted serial as a date, not a number', () => {
    const buf = sampleWorkbook({
      'xl/styles.xml': styles({ custom: [], xfs: [0, 14] }),
      'xl/worksheets/sheet1.xml': sheet('<row r="1"><c r="A1" s="1"><v>45870</v></c></row>')
    })
    const [{ rows, cells }] = readXlsx(buf).sheets
    expect(rows).toEqual([[45870]]) // the raw value still drives the diff
    expect(cells).toEqual([[0, 0, { d: '2025-08-01' }]])
  })

  it('renders a percentage and a custom datetime format', () => {
    const buf = sampleWorkbook({
      'xl/styles.xml': styles({ custom: ['yyyy\\-mm\\-dd\\ hh:mm'], xfs: [10, 164] }),
      'xl/worksheets/sheet1.xml': sheet(
        '<row r="1"><c r="A1" s="0"><v>0.125</v></c><c r="B1" s="1"><v>45870.5</v></c></row>'
      )
    })
    const [{ cells }] = readXlsx(buf).sheets
    expect(cells).toEqual([
      [0, 0, { d: '12.50%' }],
      [0, 1, { d: '2025-08-01 12:00:00' }]
    ])
  })

  it('leaves a General-formatted number with no display override', () => {
    const buf = sampleWorkbook({
      'xl/styles.xml': styles({ custom: [], xfs: [0] }),
      'xl/worksheets/sheet1.xml': sheet('<row r="1"><c r="A1" s="0"><v>45870</v></c></row>')
    })
    expect(readXlsx(buf).sheets[0].cells).toEqual([])
  })
})

describe('readXlsx — hidden state', () => {
  it('reports hidden sheets and hidden rows', () => {
    const buf = buildXlsx({
      'xl/workbook.xml':
        `${XML}<workbook xmlns:r="r"><sheets>` +
        '<sheet name="Shown" sheetId="1" r:id="rId1"/>' +
        '<sheet name="Gone" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': rels(['worksheets/sheet1.xml', 'worksheets/sheet2.xml']),
      'xl/worksheets/sheet1.xml': sheet(
        '<row r="1"><c r="A1"><v>1</v></c></row>' +
          '<row r="2" hidden="1"><c r="A2"><v>2</v></c></row>'
      ),
      'xl/worksheets/sheet2.xml': sheet('<row r="1"><c r="A1"><v>9</v></c></row>')
    })
    const { sheets } = readXlsx(buf)
    expect(sheets[0].hidden).toBe(false)
    expect(sheets[0].hiddenRows).toEqual([1])
    expect(sheets[1].hidden).toBe(true)
  })
})

describe('readXlsx — security refusals', () => {
  it('rejects a DOCTYPE (XXE / billion-laughs guard)', () => {
    const buf = sampleWorkbook({
      'xl/sharedStrings.xml': `${XML}<!DOCTYPE x [<!ENTITY a "boom">]><sst><si><t>x</t></si></sst>`
    })
    expect(() => readXlsx(buf)).toThrowError(/DOCTYPE/i)
  })

  it('refuses a decompression bomb via the total-size cap', () => {
    expect(() => readXlsx(sampleWorkbook(), { maxTotalBytes: 10 })).toThrowError(/too much data/i)
  })

  it('refuses when a single entry exceeds the per-entry cap', () => {
    expect(() => readXlsx(sampleWorkbook(), { maxEntryBytes: 5 })).toThrowError(/too large/i)
  })

  it('refuses when the whole file exceeds the input cap', () => {
    expect(() => readXlsx(sampleWorkbook(), { maxInputBytes: 5 })).toThrowError(
      /maximum .xlsx size/i
    )
  })

  it('enforces the per-sheet cell budget', () => {
    const cells = Array.from({ length: 20 }, (_, i) => `<c r="A${i + 1}"><v>${i}</v></c>`)
      .map((c) => `<row>${c}</row>`)
      .join('')
    const buf = sampleWorkbook({ 'xl/worksheets/sheet1.xml': sheet(cells) })
    expect(() => readXlsx(buf, { maxCells: 5 })).toThrowError(/cell count/i)
  })

  it('never inflates non-allowlisted entries (VBA, external links, media)', () => {
    const buf = sampleWorkbook({
      'xl/vbaProject.bin': 'MZ\x00\x00 not really vba',
      'xl/externalLinks/externalLink1.xml': `${XML}<externalLink/>`,
      'xl/media/image1.png': 'PNGDATA'
    })
    const entries = extractXlsxEntries(buf)
    expect([...entries.keys()].some((n) => n.includes('vba'))).toBe(false)
    expect([...entries.keys()].some((n) => n.includes('externalLinks'))).toBe(false)
    expect([...entries.keys()].some((n) => n.includes('media'))).toBe(false)
    // and it still reads fine
    expect(readXlsx(buf).sheets[0].rows[0]).toEqual(['Region', 100])
  })

  it('rejects data that is not a zip archive', () => {
    expect(() => readXlsx(Buffer.from('not a zip at all'))).toThrowError(/readable .xlsx/i)
  })

  it('does not pollute Object.prototype from hostile relationship ids or names', () => {
    const buf = buildXlsx({
      'xl/workbook.xml':
        `${XML}<workbook xmlns:r="r"><sheets>` +
        '<sheet name="__proto__" sheetId="1" r:id="__proto__"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        `${XML}<Relationships><Relationship Id="__proto__" Type="${REL}" ` +
        'Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': sheet('<row r="1"><c r="A1"><v>1</v></c></row>')
    })
    readXlsx(buf)
    expect({}.polluted).toBeUndefined()
    expect(Object.prototype.polluted).toBeUndefined()
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
  })
})

describe('unit helpers', () => {
  it('isAllowedEntry allows exactly the interpreted parts', () => {
    expect(isAllowedEntry('xl/workbook.xml')).toBe(true)
    expect(isAllowedEntry('xl/worksheets/sheet12.xml')).toBe(true)
    expect(isAllowedEntry('xl/sharedStrings.xml')).toBe(true)
    expect(isAllowedEntry('xl/_rels/workbook.xml.rels')).toBe(true)
    expect(isAllowedEntry('xl/styles.xml')).toBe(true)
    expect(isAllowedEntry('xl/vbaProject.bin')).toBe(false)
    expect(isAllowedEntry('xl/theme/theme1.xml')).toBe(false)
    expect(isAllowedEntry('xl/worksheets/_rels/sheet1.xml.rels')).toBe(false)
  })

  it('colToIndex maps A1-style refs to 0-based columns', () => {
    expect(colToIndex('A1')).toBe(0)
    expect(colToIndex('B12')).toBe(1)
    expect(colToIndex('Z9')).toBe(25)
    expect(colToIndex('AA1')).toBe(26)
    expect(colToIndex('AB2')).toBe(27)
    expect(colToIndex('123')).toBe(-1)
  })

  it('resolveTarget handles relative and package-absolute targets', () => {
    expect(resolveTarget('worksheets/sheet1.xml')).toBe('xl/worksheets/sheet1.xml')
    expect(resolveTarget('/xl/worksheets/sheet3.xml')).toBe('xl/worksheets/sheet3.xml')
  })

  it('resolveCellValue types values and bounds shared-string indices', () => {
    expect(resolveCellValue('s', '1', '', ['a', 'b'])).toBe('b')
    expect(resolveCellValue('s', '9', '', ['a'])).toBe('') // out of range -> empty
    expect(resolveCellValue('b', '1', '', [])).toBe(true)
    expect(resolveCellValue('b', '0', '', [])).toBe(false)
    expect(resolveCellValue('inlineStr', '', 'hi', [])).toBe('hi')
    expect(resolveCellValue('', '3.5', '', [])).toBe(3.5)
    expect(resolveCellValue('', '', '', [])).toBe('')
  })
})
