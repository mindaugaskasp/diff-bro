import { Parser } from 'saxen'
import { XlsxError, rejectDoctype } from './errors'
import { colToIndex } from './parse'
import { toR1C1, shiftFormula } from './r1c1'
import { displayText } from './numfmt'

export const SHEET_DEFAULTS = { maxCells: 2_000_000, maxMetaCells: 100_000 }

// A formula is held for display and comparison, never evaluated. The cap bounds
// what a hostile file can make the app carry per cell.
const MAX_FORMULA_CHARS = 400

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

function truthy(attr) {
  return attr === '1' || attr === 'true'
}

function startCell(st, getAttrs) {
  const a = getAttrs()
  st.type = a['t'] ?? ''
  st.col = colToIndex(a['r'] ?? '')
  st.style = Number.parseInt(a['s'] ?? '', 10)
  st.v = ''
  st.t = ''
  st.f = ''
  st.si = null
  st.fMaster = false
}

function startRow(st, getAttrs, ctx) {
  const a = getAttrs()
  const declared = Number.parseInt(a['r'] ?? '', 10)
  st.row = []
  st.rowNum = Number.isInteger(declared) && declared > 0 ? declared : ctx.rows.length + 1
  if (truthy(a['hidden'])) ctx.hiddenRows.push(ctx.rows.length)
}

function startFormula(st, getAttrs) {
  const a = getAttrs()
  st.inF = true
  st.si = a['t'] === 'shared' ? (a['si'] ?? '') : null
  st.fMaster = !!a['ref']
}

function onOpen(st, name, getAttrs, ctx) {
  if (name === 'c') startCell(st, getAttrs)
  else if (name === 'row') startRow(st, getAttrs, ctx)
  else if (name === 'v') st.inV = true
  else if (name === 'f') startFormula(st, getAttrs)
  else if (name === 't' && st.type === 'inlineStr') st.inT = true
}

function onText(st, val, decodeEntities) {
  if (st.inF) {
    if (st.f.length < MAX_FORMULA_CHARS) st.f += decodeEntities(val)
  } else if (st.inV) st.v += val
  else if (st.inT) st.t += decodeEntities(val)
}

// Returns true to stop parsing (cell budget exceeded).
function onClose(st, name, ctx) {
  if (name === 'v') st.inV = false
  else if (name === 'f') st.inF = false
  else if (name === 't') st.inT = false
  else if (name === 'c') return commitCell(st, ctx)
  else if (name === 'row') {
    ctx.rows.push(densify(st.row ?? []))
    st.row = null
  }
  return false
}

// A1 text for this cell: its own <f>, or — for a shared-formula follower, which
// arrives empty — the master's, shifted to this position the way Excel expands it.
function formulaText(st, ctx, row) {
  if (st.f) {
    const text = st.f.slice(0, MAX_FORMULA_CHARS)
    if (st.si !== null && st.fMaster) ctx.shared.set(st.si, { text, row, col: st.col })
    return text
  }
  if (st.si === null) return ''
  const master = ctx.shared.get(st.si)
  return master ? shiftFormula(master.text, row - master.row, st.col - master.col) : ''
}

function cellMeta(st, ctx, row) {
  const meta = {}
  const text = formulaText(st, ctx, row)
  if (text) {
    meta.f = text
    meta.n = toR1C1(text, row, st.col).slice(0, MAX_FORMULA_CHARS)
  }
  if (st.type === 'e') meta.e = true
  const code = Number.isInteger(st.style) ? ctx.formats[st.style] : undefined
  const display = code ? displayText(st.value, code, ctx.date1904) : null
  if (display !== null) meta.d = display
  return meta
}

function commitCell(st, ctx) {
  if (!st.row || st.col < 0) return false
  st.cells++
  if (st.cells > ctx.maxCells) return true
  st.value = resolveCellValue(st.type, st.v, st.t, ctx.sharedStrings)
  st.row[st.col] = st.value
  const meta = cellMeta(st, ctx, st.rowNum - 1)
  if (Object.keys(meta).length && ctx.cells.length < ctx.maxMetaCells) {
    ctx.cells.push([ctx.rows.length, st.col, meta])
  }
  return false
}

function newState() {
  return {
    row: null,
    rowNum: 1,
    col: -1,
    style: NaN,
    type: '',
    v: '',
    t: '',
    f: '',
    si: null,
    fMaster: false,
    value: null,
    inV: false,
    inT: false,
    inF: false,
    cells: 0
  }
}

/**
 * Walk <sheetData> into a dense value grid plus the sparse extras a cell can
 * carry: `cells` holds [row, col, { f, n, d, e }] only where there is something
 * to say, so a plain workbook pays nothing for the feature.
 * @returns {{rows: Array<Array<unknown>>, cells: Array, hiddenRows: number[]}}
 */
export function parseSheet(xml, sharedStrings, opts = {}) {
  rejectDoctype(xml)
  const maxCells = opts.maxCells ?? SHEET_DEFAULTS.maxCells
  const ctx = {
    rows: [],
    cells: [],
    hiddenRows: [],
    shared: new Map(),
    sharedStrings,
    formats: opts.formats ?? [],
    date1904: opts.date1904 === true,
    maxCells,
    maxMetaCells: opts.maxMetaCells ?? SHEET_DEFAULTS.maxMetaCells
  }
  const st = newState()
  const p = new Parser()
  p.on('openTag', (name, getAttrs) => onOpen(st, name, getAttrs, ctx))
  p.on('text', (val, decodeEntities) => onText(st, val, decodeEntities))
  p.on('closeTag', (name) => {
    if (onClose(st, name, ctx)) p.stop()
  })
  p.on('error', (err) => {
    throw new XlsxError('parse', `malformed sheet XML: ${err}`)
  })
  p.parse(xml)
  if (st.cells > maxCells) throw new XlsxError('bomb', 'sheet exceeds the maximum cell count')
  return { rows: ctx.rows, cells: ctx.cells, hiddenRows: ctx.hiddenRows }
}
