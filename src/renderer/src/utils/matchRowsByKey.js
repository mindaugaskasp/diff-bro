// Row pairing by the value a reader recognises the row BY, rather than by the
// whole row's contents. alignRows matches signatures in order, so the same
// export sorted differently reads as changed end to end; keying pairs across the
// whole sheet instead. Pure.
import { changedCells } from './alignRows'

// A cell's text cannot contain it, so ['a','b'] and ['a b',''] stay two keys.
const SEPARATOR = '\u0000'

function cellKey(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

/**
 * One pairing key per row, built from that side's own column indices.
 * Trimmed — a trailing space in an export is not a different account — but
 * never case-folded, because `ACC-1` and `acc-1` are two accounts.
 */
export function compositeKeys(rows = [], columns = []) {
  return rows.map((row) => columns.map((c) => cellKey(row?.[c])).join(SEPARATOR))
}

function queuesByKey(keys) {
  const map = new Map()
  for (let i = 0; i < keys.length; i++) {
    const queue = map.get(keys[i])
    if (queue) queue.push(i)
    else map.set(keys[i], [i])
  }
  return map
}

// A repeated key cannot say WHICH row is which, so the nth occurrence takes the
// nth — counted rather than hidden, because the reader has to know that.
function duplicateCount(leftQueues, rightQueues) {
  const keys = new Set()
  for (const [key, queue] of leftQueues) if (queue.length > 1) keys.add(key)
  for (const [key, queue] of rightQueues) if (queue.length > 1) keys.add(key)
  return keys.size
}

function pairing(leftQueues, rightKeys, leftCount) {
  const taken = new Map()
  const leftFor = new Array(rightKeys.length).fill(null)
  const matchedLeft = new Array(leftCount).fill(false)
  for (let j = 0; j < rightKeys.length; j++) {
    const queue = leftQueues.get(rightKeys[j])
    const at = taken.get(rightKeys[j]) ?? 0
    if (!queue || at >= queue.length) continue
    taken.set(rightKeys[j], at + 1)
    leftFor[j] = queue[at]
    matchedLeft[queue[at]] = true
  }
  return { leftFor, matchedLeft }
}

function pairEntry(leftRows, rightRows, at, tolerance) {
  const changed = changedCells(leftRows[at.i], rightRows[at.j], tolerance)
  return {
    status: changed.length ? 'changed' : 'same',
    left: leftRows[at.i],
    right: rightRows[at.j],
    leftIndex: at.i,
    rightIndex: at.j,
    changed
  }
}

const oneSided = (status, row, index) => ({
  status,
  left: status === 'removed' ? row : null,
  right: status === 'removed' ? null : row,
  leftIndex: status === 'removed' ? index : null,
  rightIndex: status === 'removed' ? null : index,
  changed: []
})

/**
 * Pair two sheets' rows by key. Display order follows the RIGHT file — the one
 * the reader has open — with a removed row emitted just before the first
 * surviving left row that followed it, so it keeps its context.
 * @returns {{rows: Array<{status:'same'|'changed'|'added'|'removed', left, right,
 *   leftIndex:number|null, rightIndex:number|null, changed:number[]}>,
 *   duplicateKeys:number}}
 */
export function matchRowsByKey(leftRows = [], rightRows = [], opts = {}) {
  const leftKeys = opts.leftKeys ?? []
  const rightKeys = opts.rightKeys ?? []
  const tolerance = opts.tolerance ?? null
  const leftQueues = queuesByKey(leftKeys)
  const { leftFor, matchedLeft } = pairing(leftQueues, rightKeys, leftRows.length)

  const rows = []
  let cursor = 0
  const flushTo = (limit) => {
    while (cursor < limit) {
      if (!matchedLeft[cursor]) rows.push(oneSided('removed', leftRows[cursor], cursor))
      cursor++
    }
  }
  for (let j = 0; j < rightRows.length; j++) {
    const i = leftFor[j]
    if (i === null) {
      rows.push(oneSided('added', rightRows[j], j))
      continue
    }
    flushTo(i)
    rows.push(pairEntry(leftRows, rightRows, { i, j }, tolerance))
  }
  flushTo(leftRows.length)

  return { rows, duplicateKeys: duplicateCount(leftQueues, queuesByKey(rightKeys)) }
}
