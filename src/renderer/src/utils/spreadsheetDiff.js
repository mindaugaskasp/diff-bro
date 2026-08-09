// Workbook diff: pair sheets by name, pair their columns (headerPairing), align
// each pair's rows — by key where the reader named one, otherwise by whole-row
// signature (alignRows) — and roll up per-sheet stats. Pure.
import { alignRows, rowKeys, valuesEqual } from './alignRows'
import { headerPairing, pairedColumns } from './alignColumns'
import { compositeKeys, matchRowsByKey } from './matchRowsByKey'
import { comparableCell, comparableRows, metaAt, metaIndex } from './sheetCells'

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
  for (const r of rows) if (r.status !== 'same') stats[r.status]++
  return stats
}

// alignRows works on the comparison view of each sheet, so the paired entries
// come back holding those keys; swap the real values in by index.
function attachValues(entry, left, right) {
  entry.left = entry.leftIndex === null ? null : (left.rows?.[entry.leftIndex] ?? null)
  entry.right = entry.rightIndex === null ? null : (right.rows?.[entry.rightIndex] ?? null)
}

// A changed row's columns split two ways: the value moved, or it did not and
// something behind it did — a formula replaced by its own cached value, or an
// error where the text reads the same. Comparing the tagged cells rather than
// the raw ones is what carries the no-tolerance mark on a date this far.
function classifyChanged(entry, columns, ctx) {
  const value = []
  const formula = []
  for (const c of entry.changed) {
    const col = columns[c]
    const l = comparableCell(
      entry.left?.[col.left],
      metaAt(ctx.leftMeta, entry.leftIndex, col.left)
    )
    const r = comparableCell(
      entry.right?.[col.right],
      metaAt(ctx.rightMeta, entry.rightIndex, col.right)
    )
    if (valuesEqual(l, r, ctx.tolerance)) formula.push(c)
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

// Rows re-indexed into the paired-column space, so one inserted column cannot
// shift every column after it out of alignment.
function project(rows, indices) {
  return rows.map((row) => indices.map((i) => row[i]))
}

// Keys are chosen per sheet, because the columns are. A Map rather than an
// object: the sheet name comes from the file, and `__proto__` must not resolve
// to anything.
const keyColumnsFor = (keyColumns, name) =>
  keyColumns instanceof Map ? (keyColumns.get(name) ?? []) : []

// The columns a reader chose as the row's identity, as each side's own indices.
// A column only one side has cannot key both, so it is dropped rather than
// keying one side off a column the other does not have.
function keyColumnsOf(columns, chosen) {
  const picked = (chosen ?? [])
    .map((i) => columns[i])
    .filter((c) => c && c.left !== null && c.right !== null)
  return { left: picked.map((c) => c.left), right: picked.map((c) => c.right) }
}

function projected(left, right, pairs) {
  return {
    left: project(
      comparableRows(left),
      pairs.map((c) => c.left)
    ),
    right: project(
      comparableRows(right),
      pairs.map((c) => c.right)
    )
  }
}

function keyedRows(rows, keys, ctx) {
  return matchRowsByKey(rows.left, rows.right, {
    leftKeys: compositeKeys(ctx.leftRows, keys.left),
    rightKeys: compositeKeys(ctx.rightRows, keys.right),
    tolerance: ctx.tolerance
  })
}

function signatureRows(rows, pairs, ctx) {
  const keyColumn = ctx.opts.keyColumn ?? 0
  return {
    rows: alignRows(rows.left, rows.right, {
      ...ctx.opts,
      leftKeys: rowKeys(ctx.leftRows, pairs[keyColumn]?.left ?? 0),
      rightKeys: rowKeys(ctx.rightRows, pairs[keyColumn]?.right ?? 0)
    }),
    duplicateKeys: 0
  }
}

function alignedRows(left, right, columns, opts) {
  const pairs = pairedColumns(columns)
  const rows = projected(left, right, pairs)
  const ctx = {
    leftRows: left.rows ?? [],
    rightRows: right.rows ?? [],
    tolerance: opts.tolerance ?? null,
    opts
  }
  const keys = keyColumnsOf(columns, opts.keyColumns)
  return keys.left.length ? keyedRows(rows, keys, ctx) : signatureRows(rows, pairs, ctx)
}

function bothSides(name, left, right, opts) {
  const { columns, headerRows } = headerPairing(left.rows ?? [], right.rows ?? [])
  const tolerance = opts.tolerance ?? null
  const { rows, duplicateKeys } = alignedRows(left, right, columns, {
    ...opts,
    tolerance,
    keyColumns: keyColumnsFor(opts.keyColumns, name)
  })
  // Where each paired column sits in the DISPLAY order, so a changed cell is
  // reported at the index the grid actually renders.
  const pairAt = columns.reduce((acc, c, i) => {
    if (c.left !== null && c.right !== null) acc.push(i)
    return acc
  }, [])

  const state = sheetState(left, right)
  for (const entry of rows) {
    entry.changed = entry.changed.map((c) => pairAt[c])
    attachValues(entry, left, right)
    if (entry.status === 'changed') classifyChanged(entry, columns, { ...state, tolerance })
    else entry.formulaChanged = []
  }

  const stats = statsOf(rows)
  return {
    name,
    present: 'both',
    rows,
    stats,
    columns,
    columnsAdded: columns.filter((c) => c.left === null).length,
    columnsRemoved: columns.filter((c) => c.right === null).length,
    changes: total(stats),
    headerRows,
    duplicateKeys,
    ...state
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
  const own = sheet.rows ?? []
  const { columns } = side === 'left' ? headerPairing(own, []) : headerPairing([], own)
  const stats = statsOf(rows)
  const state = side === 'left' ? sheetState(sheet, null) : sheetState(null, sheet)
  return {
    name,
    present: side,
    rows,
    stats,
    columns,
    columnsAdded: 0,
    columnsRemoved: 0,
    changes: total(stats),
    headerRows: null,
    duplicateKeys: 0,
    ...state
  }
}

function total(stats) {
  return stats.changed + stats.added + stats.removed
}

/**
 * @returns {Array<{name:string, present:'both'|'left'|'right', rows:Array,
 *   stats:{changed:number,added:number,removed:number},
 *   columns:Array<{left:number|null,right:number|null,name:string}>,
 *   columnsAdded:number, columnsRemoved:number, changes:number,
 *   headerRows:{left:number,right:number}|null, duplicateKeys:number,
 *   hidden:boolean, hasFormulas:boolean, leftMeta:Map, rightMeta:Map,
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
