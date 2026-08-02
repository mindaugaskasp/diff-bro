// The grid diff as a flat list a reviewer can take away: one row per change,
// with the cell it happened in. Pure.
import { columnName } from './spreadsheetDiff'
import { cellText, metaAt } from './sheetCells'

export const REGISTER_HEADER = ['Sheet', 'Cell', 'Column', 'Change', 'Before', 'After']

function ref(rowIndex, colIndex) {
  return rowIndex === null || colIndex === null ? '' : `${columnName(colIndex)}${rowIndex + 1}`
}

function textAt(row, meta, rowIndex, colIndex) {
  if (colIndex === null || row === null || row === undefined) return ''
  return cellText(row[colIndex], metaAt(meta, rowIndex, colIndex), false)
}

function cellEntries(sheet, entry, kinds) {
  const out = []
  for (const [cols, kind] of kinds) {
    for (const ci of cols) {
      const col = sheet.columns[ci]
      out.push([
        sheet.name,
        ref(entry.leftIndex, col.left) || ref(entry.rightIndex, col.right),
        col.name,
        kind,
        textAt(entry.left, sheet.leftMeta, entry.leftIndex, col.left),
        textAt(entry.right, sheet.rightMeta, entry.rightIndex, col.right)
      ])
    }
  }
  return out
}

function rowEntry(sheet, entry) {
  const added = entry.status === 'added'
  const side = added ? entry.right : entry.left
  const meta = added ? sheet.rightMeta : sheet.leftMeta
  const index = added ? entry.rightIndex : entry.leftIndex
  const values = sheet.columns
    .map((col) => textAt(side, meta, index, added ? col.right : col.left))
    .filter((v) => v !== '')
    .join(' | ')
  return [
    sheet.name,
    `${index + 1}`,
    '',
    added ? 'Row added' : 'Row removed',
    added ? '' : values,
    added ? values : ''
  ]
}

function columnEntries(sheet) {
  return sheet.columns
    .filter((col) => col.left === null || col.right === null)
    .map((col) => [
      sheet.name,
      '',
      col.name,
      col.left === null ? 'Column added' : 'Column removed',
      '',
      ''
    ])
}

/**
 * @param {Array<object>} sheets the result of diffWorkbooks
 * @returns {string[][]} rows, header first
 */
export function changeRegister(sheets = []) {
  const out = [REGISTER_HEADER]
  for (const sheet of sheets) {
    out.push(...columnEntries(sheet))
    for (const entry of sheet.rows) {
      if (entry.status === 'changed') {
        out.push(
          ...cellEntries(sheet, entry, [
            [entry.changed, 'Value'],
            [entry.formulaChanged, 'Formula']
          ])
        )
      } else if (entry.status !== 'same') {
        out.push(rowEntry(sheet, entry))
      }
    }
  }
  return out
}

// A field opening with one of these is read as a formula when the exported file
// is opened in a spreadsheet — and these values came from a file the user did
// not write. A leading apostrophe is what makes Excel treat it as text.
const INJECTION = /^[=+\-@\t\r]/

function field(value) {
  const s = String(value ?? '')
  const safe = INJECTION.test(s) ? `'${s}` : s
  return /["\n\r,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** CSV text, CRLF-terminated as RFC 4180 asks. */
export function toCsv(rows) {
  return rows.map((r) => r.map(field).join(',')).join('\r\n')
}
