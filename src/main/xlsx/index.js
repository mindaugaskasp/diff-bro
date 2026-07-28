import { extractXlsxEntries } from './unzip'
import { decodeUtf8, XlsxError } from './errors'
import { parseSharedStrings, parseWorkbook, parseRels, resolveTarget } from './parse'
import { parseSheet } from './sheet'

// Read an .xlsx buffer into { sheets: [{ name, rows }] }. Read-only, no formula
// eval — the security posture lives in unzip.js (allowlist + bomb caps) and
// errors.js (DOCTYPE rejection). Throws XlsxError on refusal.
export function readXlsx(buffer, opts = {}) {
  const entries = extractXlsxEntries(buffer, opts)
  const textOf = (name) => (entries.has(name) ? decodeUtf8(entries.get(name)) : null)

  const wbXml = textOf('xl/workbook.xml')
  if (!wbXml) throw new XlsxError('format', 'workbook.xml is missing')

  const ssXml = textOf('xl/sharedStrings.xml')
  const sharedStrings = ssXml ? parseSharedStrings(ssXml) : []
  const relsXml = textOf('xl/_rels/workbook.xml.rels')
  const rels = relsXml ? parseRels(relsXml) : new Map()

  const sheets = parseWorkbook(wbXml).map((s) => ({
    name: s.name,
    rows: sheetRows(textOf, rels.get(s.rid), sharedStrings, opts)
  }))
  return { sheets }
}

function sheetRows(textOf, target, sharedStrings, opts) {
  if (!target) return []
  const xml = textOf(resolveTarget(target))
  return xml ? parseSheet(xml, sharedStrings, opts) : []
}
