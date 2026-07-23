// Workbook-level diff: pair sheets by name across the two files, align each
// pair's rows (utils/alignRows), and roll up per-sheet stats. Pure — the viewer
// and its composable render whatever this returns.
import { alignRows } from './alignRows'

// 0 -> "A", 25 -> "Z", 26 -> "AA" (bijective base-26), for the grid's column
// headers.
export function columnName(index) {
  let n = index + 1
  let name = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

function statsOf(rows) {
  const stats = { changed: 0, added: 0, removed: 0 }
  let columns = 0
  for (const r of rows) {
    if (r.status !== 'same') stats[r.status]++
    columns = Math.max(columns, r.left?.length ?? 0, r.right?.length ?? 0)
  }
  return { stats, columns }
}

function bothSides(name, left, right, opts) {
  const rows = alignRows(left.rows ?? [], right.rows ?? [], opts)
  const { stats, columns } = statsOf(rows)
  return { name, present: 'both', rows, stats, columns, changes: total(stats) }
}

function oneSide(name, sheet, side) {
  const status = side === 'left' ? 'removed' : 'added'
  const rows = (sheet.rows ?? []).map((r, idx) => ({
    status,
    left: side === 'left' ? r : null,
    right: side === 'left' ? null : r,
    leftIndex: side === 'left' ? idx : null,
    rightIndex: side === 'left' ? null : idx,
    changed: []
  }))
  const { stats, columns } = statsOf(rows)
  return { name, present: side, rows, stats, columns, changes: total(stats) }
}

function total(stats) {
  return stats.changed + stats.added + stats.removed
}

// The grid renders real DOM rows, so an enormous sheet would freeze the window
// (there's no virtualization yet). Cap what we hand the viewer and report how
// many rows are held back, rather than letting the app hang. A follow-up can
// swap this for true row virtualization.
export const RENDER_ROW_CAP = 3000
export function pageRows(rows, cap = RENDER_ROW_CAP) {
  if (rows.length <= cap) return { rows, hidden: 0 }
  return { rows: rows.slice(0, cap), hidden: rows.length - cap }
}

/**
 * @returns {Array<{name:string, present:'both'|'left'|'right', rows:Array,
 *   stats:{changed:number,added:number,removed:number}, columns:number,
 *   changes:number}>}
 */
export function diffWorkbooks(leftSheets = [], rightSheets = [], opts = {}) {
  const rightByName = new Map(rightSheets.map((s) => [s.name, s]))
  const seen = new Set()
  const out = []
  for (const left of leftSheets) {
    const right = rightByName.get(left.name)
    if (right) {
      seen.add(left.name)
      out.push(bothSides(left.name, left, right, opts))
    } else {
      out.push(oneSide(left.name, left, 'left'))
    }
  }
  for (const right of rightSheets) {
    if (!seen.has(right.name)) out.push(oneSide(right.name, right, 'right'))
  }
  return out
}
