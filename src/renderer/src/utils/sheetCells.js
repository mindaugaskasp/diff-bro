// The sparse extras a spreadsheet cell can carry — its formula, the rendering
// its number format asks for, whether it holds an error — as a lookup, plus the
// comparison view of a sheet. Pure.

// Columns stop at XFD (16384), so this packs a coordinate into one integer.
const COL_SPAN = 16384
const EMPTY = new Map()

const key = (row, col) => row * COL_SPAN + col

/** @param {import('../types').SheetGrid} sheet */
export function metaIndex(sheet) {
  const cells = sheet?.cells
  if (!Array.isArray(cells) || !cells.length) return EMPTY
  const map = new Map()
  for (const [row, col, meta] of cells) map.set(key(row, col), meta)
  return map
}

/** @returns {import('../types').CellMeta|null} */
export function metaAt(index, row, col) {
  return row === null || row === undefined ? null : (index.get(key(row, col)) ?? null)
}

export function displayValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}

/** What one cell shows: its formula on request, its formatted text, or its value. */
export function cellText(value, meta, showFormulas) {
  if (showFormulas && meta?.f) return `=${meta.f}`
  return meta?.d ?? displayValue(value)
}

// A separator no cell value can contain, so a text cell reading `3 =RC[-1]`
// can never collide with a formula cell that produced 3.
export const TAG = '\u0000'

// A cell's identity for the diff. The formula is part of it — in R1C1 form, so
// a row insert does not rewrite every formula below into a false change — and so
// is holding an error rather than text that merely reads like one. Without this
// a formula overwritten by its own cached value looked unchanged.
function comparableCell(value, meta) {
  if (!meta?.f && !meta?.e) return value
  const tag = meta.e ? `${TAG}#` : `${TAG}=${meta.n ?? meta.f}`
  return `${displayValue(value)}${tag}`
}

/** The sheet's rows as the diff sees them; the raw grid when nothing is tagged. */
export function comparableRows(sheet) {
  const rows = sheet?.rows ?? []
  const index = metaIndex(sheet)
  if (index === EMPTY) return rows
  return rows.map((row, r) => row.map((v, c) => comparableCell(v, index.get(key(r, c)))))
}
