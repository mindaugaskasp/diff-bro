import { extractXlsxEntries } from './unzip'
import { decodeUtf8, XlsxError } from './errors'
import { parseSharedStrings, parseWorkbook, parseRels, resolveTarget } from './parse'
import { parseStyles } from './styles'
import { parseSheet } from './sheet'

// Read an .xlsx buffer into { sheets: [{ name, rows, cells, hidden, hiddenRows }] }.
// Read-only, no formula eval — the security posture lives in unzip.js (allowlist
// + bomb caps) and errors.js (DOCTYPE rejection). Throws XlsxError on refusal.
export function readXlsx(buffer, opts = {}) {
  const entries = extractXlsxEntries(buffer, opts)
  const textOf = (name) => (entries.has(name) ? decodeUtf8(entries.get(name)) : null)

  const wbXml = textOf('xl/workbook.xml')
  if (!wbXml) throw new XlsxError('format', 'workbook.xml is missing')

  const ssXml = textOf('xl/sharedStrings.xml')
  const sharedStrings = ssXml ? parseSharedStrings(ssXml) : []
  const relsXml = textOf('xl/_rels/workbook.xml.rels')
  const rels = relsXml ? parseRels(relsXml) : new Map()
  const stylesXml = textOf('xl/styles.xml')

  const { sheets, date1904 } = parseWorkbook(wbXml)
  const sheetOpts = { ...opts, date1904, formats: stylesXml ? parseStyles(stylesXml) : [] }

  return {
    sheets: sheets.map((s) => ({
      name: s.name,
      hidden: s.hidden,
      ...sheetParts(textOf, rels.get(s.rid), sharedStrings, sheetOpts)
    }))
  }
}

function sheetParts(textOf, target, sharedStrings, opts) {
  const xml = target ? textOf(resolveTarget(target)) : null
  return xml ? parseSheet(xml, sharedStrings, opts) : { rows: [], cells: [], hiddenRows: [] }
}
