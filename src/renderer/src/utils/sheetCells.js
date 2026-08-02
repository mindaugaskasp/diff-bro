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

/**
 * A cell's identity for the diff: the value, plus what stands behind it — a
 * formula in R1C1 form (so a row insert does not rewrite every formula below
 * into a false change) or an error marker. Without this a formula overwritten
 * by its own cached value looked unchanged.
 *
 * The two stay SEPARATE fields rather than one joined string so a tolerance can
 * forgive the value while still catching the formula going away, and so text
 * that happens to read like a formula can never collide with a real one.
 *
 * `x` marks a cell no tolerance may touch: a date is stored as a serial, and a
 * materiality threshold read against 45870 forgives months.
 * @returns {unknown|{v: unknown, k: string, x?: true}} the raw value where
 *   there is nothing to add — most cells, and no allocation for them.
 */
export function comparableCell(value, meta) {
  if (!meta) return value
  const { f, e, dt } = meta
  if (!f && !e && !dt) return value
  const cell = { v: value, k: standsBehind(meta) }
  if (dt) cell.x = true
  return cell
}

function standsBehind(meta) {
  if (meta.e) return '#'
  return meta.f ? `=${meta.n ?? meta.f}` : ''
}

/** The sheet's rows as the diff sees them; the raw grid when nothing is tagged. */
export function comparableRows(sheet) {
  const rows = sheet?.rows ?? []
  const index = metaIndex(sheet)
  if (index === EMPTY) return rows
  return rows.map((row, r) => row.map((v, c) => comparableCell(v, index.get(key(r, c)))))
}
