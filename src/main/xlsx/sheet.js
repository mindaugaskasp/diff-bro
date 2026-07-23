import { Parser } from 'saxen'
import { XlsxError, rejectDoctype } from './errors'
import { colToIndex } from './parse'

export const SHEET_DEFAULTS = { maxCells: 2_000_000 }

// Turn a cell's raw <v>/<t> text into a typed JS value. A formula cell reaches
// here with only its cached <v> result — <f> is dropped during parsing (see
// onText) — so nothing is ever re-evaluated. Dates are numbers: without reading
// xl/styles.xml (deliberately skipped) a date serial can't be distinguished
// from a plain number; that's a documented limitation of the value diff.
export function resolveCellValue(type, v, t, sharedStrings) {
  switch (type) {
    case 's': {
      const i = Number.parseInt(v, 10)
      return i >= 0 && i < sharedStrings.length ? sharedStrings[i] : ''
    }
    case 'inlineStr':
      return t
    case 'str':
      return v
    case 'b':
      return v === '1'
    case 'e':
      return v
    default: {
      if (v === '') return ''
      const n = Number(v)
      return Number.isFinite(n) ? n : v
    }
  }
}

function densify(row) {
  const out = []
  for (let i = 0; i < row.length; i++) out.push(row[i] === undefined ? null : row[i])
  return out
}

function onOpen(st, name, getAttrs) {
  if (name === 'c') {
    const a = getAttrs()
    st.type = a['t'] ?? ''
    st.col = colToIndex(a['r'] ?? '')
    st.v = ''
    st.t = ''
  } else if (name === 'row') st.row = []
  else if (name === 'v') st.inV = true
  else if (name === 'f') st.inF = true
  else if (name === 't' && st.type === 'inlineStr') st.inT = true
}

function onText(st, val, decodeEntities) {
  if (st.inF) return // formula text is deliberately never captured
  if (st.inV) st.v += val
  else if (st.inT) st.t += decodeEntities(val)
}

// Returns true to signal the caller to stop parsing (cell budget exceeded).
// `ctx` carries { rows, sharedStrings, maxCells } to stay within max-params.
function onClose(st, name, ctx) {
  if (name === 'v') st.inV = false
  else if (name === 'f') st.inF = false
  else if (name === 't') st.inT = false
  else if (name === 'c') return commitCell(st, ctx.sharedStrings, ctx.maxCells)
  else if (name === 'row') {
    ctx.rows.push(densify(st.row ?? []))
    st.row = null
  }
  return false
}

function commitCell(st, sharedStrings, maxCells) {
  if (!st.row || st.col < 0) return false
  st.cells++
  if (st.cells > maxCells) return true
  st.row[st.col] = resolveCellValue(st.type, st.v, st.t, sharedStrings)
  return false
}

// Walk <sheetData> into an array of rows, each a dense array of cell values.
export function parseSheet(xml, sharedStrings, opts = {}) {
  rejectDoctype(xml)
  const maxCells = opts.maxCells ?? SHEET_DEFAULTS.maxCells
  const rows = []
  const st = { row: null, col: -1, type: '', v: '', t: '', inV: false, inT: false, inF: false, cells: 0 }
  const ctx = { rows, sharedStrings, maxCells }
  const p = new Parser()
  p.on('openTag', (name, getAttrs) => onOpen(st, name, getAttrs))
  p.on('text', (val, decodeEntities) => onText(st, val, decodeEntities))
  p.on('closeTag', (name) => {
    if (onClose(st, name, ctx)) p.stop()
  })
  p.on('error', (err) => {
    throw new XlsxError('parse', `malformed sheet XML: ${err}`)
  })
  p.parse(xml)
  if (st.cells > maxCells) throw new XlsxError('bomb', 'sheet exceeds the maximum cell count')
  return rows
}
