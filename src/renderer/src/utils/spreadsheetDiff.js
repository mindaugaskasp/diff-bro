// Workbook diff: pair sheets by name, align each pair's rows (alignRows), roll
// up per-sheet stats. Pure.
import { alignRows, cellsEqual, rowKeys } from './alignRows'
import { comparableRows, metaIndex } from './sheetCells'

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

// alignRows works on the comparison view of each sheet, so the paired entries
// come back holding those keys; swap the real values in by index.
function attachValues(entry, left, right) {
  entry.left = entry.leftIndex === null ? null : (left.rows?.[entry.leftIndex] ?? null)
  entry.right = entry.rightIndex === null ? null : (right.rows?.[entry.rightIndex] ?? null)
}

// A changed row's columns split two ways: the value moved, or it did not and
// something behind it did — a formula replaced by its own cached value, or an
// error where the text reads the same.
function classifyChanged(entry) {
  const value = []
  const formula = []
  for (const c of entry.changed) {
    if (cellsEqual(entry.left?.[c], entry.right?.[c])) formula.push(c)
    else value.push(c)
  }
  entry.changed = value
  entry.formulaChanged = formula
}

const hasFormula = (sheet) => !!sheet?.cells?.some(([, , meta]) => meta.f)

function sheetState(left, right) {
  return {
    hidden: !!(left?.hidden || right?.hidden),
    hasFormulas: hasFormula(left) || hasFormula(right),
    leftMeta: metaIndex(left),
    rightMeta: metaIndex(right),
    leftHidden: new Set(left?.hiddenRows ?? []),
    rightHidden: new Set(right?.hiddenRows ?? [])
  }
}

function bothSides(name, left, right, opts) {
  const keyColumn = opts.keyColumn ?? 0
  const rows = alignRows(comparableRows(left), comparableRows(right), {
    ...opts,
    leftKeys: rowKeys(left.rows ?? [], keyColumn),
    rightKeys: rowKeys(right.rows ?? [], keyColumn)
  })
  for (const entry of rows) {
    attachValues(entry, left, right)
    if (entry.status === 'changed') classifyChanged(entry)
    else entry.formulaChanged = []
  }
  const { stats, columns } = statsOf(rows)
  return {
    name,
    present: 'both',
    rows,
    stats,
    columns,
    changes: total(stats),
    ...sheetState(left, right)
  }
}

function oneSide(name, sheet, side) {
  const status = side === 'left' ? 'removed' : 'added'
  const rows = (sheet.rows ?? []).map((r, idx) => ({
    status,
    left: side === 'left' ? r : null,
    right: side === 'left' ? null : r,
    leftIndex: side === 'left' ? idx : null,
    rightIndex: side === 'left' ? null : idx,
    changed: [],
    formulaChanged: []
  }))
  const { stats, columns } = statsOf(rows)
  const state = side === 'left' ? sheetState(sheet, null) : sheetState(null, sheet)
  return { name, present: side, rows, stats, columns, changes: total(stats), ...state }
}

function total(stats) {
  return stats.changed + stats.added + stats.removed
}

/**
 * @returns {Array<{name:string, present:'both'|'left'|'right', rows:Array,
 *   stats:{changed:number,added:number,removed:number}, columns:number,
 *   changes:number, hidden:boolean, leftMeta:Map, rightMeta:Map,
 *   leftHidden:Set<number>, rightHidden:Set<number>}>}
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
