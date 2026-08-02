// Row alignment for the spreadsheet diff. Pure + unit-tested. An LCS over
// whole-row signatures anchors identical rows so an inserted/deleted row can't
// cascade the rows below into false "changed"; within each gap a removed row is
// paired with an added one only when their key columns (col A default) match.

function normCell(v) {
  return v === null || v === undefined ? '' : v
}

// A tagged cell (see sheetCells.comparableCell) is { v, k, x }: the value, what
// stands behind it, and whether a tolerance may touch it. Splitting the first
// two is what lets a tolerance forgive a formula cell's result without
// forgiving the formula being replaced.
function parts(cell) {
  return cell && typeof cell === 'object' ? cell : { v: cell, k: '' }
}

/**
 * The two cells' values, ignoring what stands behind them. Tolerance is dropped
 * where either side is exact-only — the serial behind a date is not an amount,
 * so a percentage of it is meaningless.
 */
export function valuesEqual(a, b, tolerance = null) {
  const l = parts(a)
  const r = parts(b)
  const t = l.x || r.x ? null : tolerance
  return normCell(l.v) === normCell(r.v) || withinTolerance(l.v, r.v, t)
}

/**
 * Whether two numbers are close enough to count as the same.
 * @param {{abs?: number, pct?: number}|null} tolerance
 */
export function withinTolerance(a, b, tolerance) {
  // A sign change is material at any threshold: a number that crossed zero is
  // never "the same figure, rounded differently".
  if (!tolerance || !comparableNumbers(a, b) || a * b < 0) return false
  const delta = Math.abs(a - b)
  if (tolerance.abs != null && delta <= tolerance.abs) return true
  if (tolerance.pct == null) return false
  const scale = Math.max(Math.abs(a), Math.abs(b))
  return scale > 0 && (delta / scale) * 100 <= tolerance.pct
}

function comparableNumbers(a, b) {
  return Number.isFinite(a) && Number.isFinite(b)
}

export function cellsEqual(a, b, tolerance = null) {
  return parts(a).k === parts(b).k && valuesEqual(a, b, tolerance)
}

// Column indices whose values differ between two rows.
export function changedCells(left, right, tolerance = null) {
  const n = Math.max(left.length, right.length)
  const cols = []
  for (let i = 0; i < n; i++) if (!cellsEqual(left[i], right[i], tolerance)) cols.push(i)
  return cols
}

// JSON of the row with trailing empties trimmed, so ["a",1] == ["a",1,null,""].
function rowSignature(row) {
  let end = row.length
  while (end > 0 && normCell(row[end - 1]) === '') end--
  const trimmed = []
  for (let i = 0; i < end; i++) trimmed.push(normCell(row[i]))
  return JSON.stringify(trimmed)
}

// Per-row pairing key. Kept separate from the row's diff identity: a key cell
// whose formula was replaced by its value still names the same row.
export function rowKeys(rows, keyColumn = 0) {
  return rows.map((row) => String(normCell(row[keyColumn])))
}

// Classic LCS backtrace over signature arrays -> ops of { t:'eq'|'del'|'ins' }.
function lcsOps(leftSig, rightSig) {
  const n = leftSig.length
  const m = rightSig.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        leftSig[i] === rightSig[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (leftSig[i] === rightSig[j]) ops.push({ t: 'eq', i: i++, j: j++ })
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ t: 'del', i: i++ })
    else ops.push({ t: 'ins', j: j++ })
  }
  while (i < n) ops.push({ t: 'del', i: i++ })
  while (j < m) ops.push({ t: 'ins', j: j++ })
  return ops
}

// Fallback when the LCS table would be too large: align by position.
function positionalOps(leftSig, rightSig) {
  const ops = []
  const min = Math.min(leftSig.length, rightSig.length)
  for (let k = 0; k < min; k++) {
    if (leftSig[k] === rightSig[k]) ops.push({ t: 'eq', i: k, j: k })
    else ops.push({ t: 'del', i: k }, { t: 'ins', j: k })
  }
  for (let i = min; i < leftSig.length; i++) ops.push({ t: 'del', i })
  for (let j = min; j < rightSig.length; j++) ops.push({ t: 'ins', j })
  return ops
}

// One gap → changed/removed/added, pairing del+ins rows by matching key.
function emitGap(gap, leftRows, rightRows, keys) {
  const dels = gap.filter((o) => o.t === 'del').map((o) => o.i)
  const ins = gap.filter((o) => o.t === 'ins').map((o) => o.j)
  const byKey = new Map()
  for (const j of ins) {
    const k = keys.right[j]
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(j)
  }
  const used = new Set()
  const out = []
  for (const i of dels) {
    const queue = byKey.get(keys.left[i])
    if (queue && queue.length) {
      const j = queue.shift()
      used.add(j)
      const changed = changedCells(leftRows[i], rightRows[j], keys.tolerance)
      out.push({
        // Nothing differs once the tolerance is applied, so the rows ARE the
        // same — the LCS could not know that, since it matches signatures whole.
        status: changed.length ? 'changed' : 'same',
        left: leftRows[i],
        right: rightRows[j],
        leftIndex: i,
        rightIndex: j,
        changed
      })
    } else {
      out.push({
        status: 'removed',
        left: leftRows[i],
        right: null,
        leftIndex: i,
        rightIndex: null,
        changed: []
      })
    }
  }
  for (const j of ins) {
    if (!used.has(j)) {
      out.push({
        status: 'added',
        left: null,
        right: rightRows[j],
        leftIndex: null,
        rightIndex: j,
        changed: []
      })
    }
  }
  return out
}

function buildEntries(ops, leftRows, rightRows, keys) {
  const out = []
  let gap = []
  const flush = () => {
    if (gap.length) out.push(...emitGap(gap, leftRows, rightRows, keys))
    gap = []
  }
  for (const op of ops) {
    if (op.t !== 'eq') gap.push(op)
    else {
      flush()
      out.push({
        status: 'same',
        left: leftRows[op.i],
        right: rightRows[op.j],
        leftIndex: op.i,
        rightIndex: op.j,
        changed: []
      })
    }
  }
  flush()
  return out
}

/**
 * Align two sheets' rows into a list of paired entries. `leftKeys`/`rightKeys`
 * override the pairing keys when the rows carry a diff identity that is not the
 * value a reader would recognise the row by (see spreadsheetDiff).
 * @returns {Array<{status:'same'|'changed'|'added'|'removed', left, right,
 *   leftIndex:number|null, rightIndex:number|null, changed:number[]}>}
 */
export function alignRows(leftRows = [], rightRows = [], opts = {}) {
  const keyColumn = opts.keyColumn ?? 0
  const budget = opts.maxProduct ?? 4_000_000
  const leftSig = leftRows.map(rowSignature)
  const rightSig = rightRows.map(rowSignature)
  const ops =
    leftRows.length * rightRows.length > budget
      ? positionalOps(leftSig, rightSig)
      : lcsOps(leftSig, rightSig)
  const keys = {
    left: opts.leftKeys ?? rowKeys(leftRows, keyColumn),
    right: opts.rightKeys ?? rowKeys(rightRows, keyColumn),
    tolerance: opts.tolerance ?? null
  }
  return buildEntries(ops, leftRows, rightRows, keys)
}
