// Column alignment by header row. Comparing cell i against cell i means one
// inserted column shifts every column after it, so a single edit reads as "the
// whole right-hand side of the sheet changed". An LCS over the header row pairs
// the columns that survived; everything downstream works on those pairs. Pure.

const MAX_COLUMNS = 4096
// Bounded: past a handful of rows, a "header" is just the first row that happens
// to look like one.
const MAX_HEADER_SCAN = 10

// Widest row, not the header: a sheet may carry data past its own header.
function widthOf(rows) {
  let width = 0
  for (const row of rows) width = Math.max(width, row.length)
  return Math.min(width, MAX_COLUMNS)
}

function headerLabels(rows, width, at = 0) {
  const header = rows[at] ?? []
  const out = []
  for (let i = 0; i < width; i++) {
    const v = header[i]
    out.push(v === null || v === undefined ? '' : String(v))
  }
  return out
}

// Blank or repeated labels would pair columns by coincidence, and a header
// describes the rows beneath it, so it needs at least one.
function usable(labels, rowsBeneath) {
  if (!labels.length || rowsBeneath < 1) return false
  const seen = new Set()
  for (const l of labels) {
    if (!l || seen.has(l)) return false
    seen.add(l)
  }
  return true
}

/** The first row that reads as a header, or null within `MAX_HEADER_SCAN`. */
function headerRowIndex(rows, width) {
  const limit = Math.min(rows.length, MAX_HEADER_SCAN)
  for (let at = 0; at < limit; at++) {
    if (usable(headerLabels(rows, width, at), rows.length - at - 1)) return at
  }
  return null
}

function lcsOps(a, b) {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ left: i, right: j, name: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ left: i, right: null, name: a[i++] })
    } else {
      out.push({ left: null, right: j, name: b[j++] })
    }
  }
  while (i < n) out.push({ left: i, right: null, name: a[i++] })
  while (j < m) out.push({ left: null, right: j, name: b[j++] })
  return out
}

function positional(leftLabels, rightLabels) {
  const out = []
  const width = Math.max(leftLabels.length, rightLabels.length)
  for (let i = 0; i < width; i++) {
    const left = i < leftLabels.length ? i : null
    const right = i < rightLabels.length ? i : null
    out.push({ left, right, name: leftLabels[i] || rightLabels[i] || '' })
  }
  return out
}

/**
 * Pair the two sheets' columns, and say which row the labels came from.
 * @returns {{columns: Array<{left: number|null, right: number|null, name: string}>,
 *   headerRows: {left: number, right: number}|null}} `headerRows` is null when
 *   the pairing fell back to position — naming a row it did not use would claim
 *   the columns were matched by name.
 */
export function headerPairing(leftRows = [], rightRows = []) {
  const leftAt = headerRowIndex(leftRows, widthOf(leftRows))
  const rightAt = headerRowIndex(rightRows, widthOf(rightRows))
  const leftLabels = headerLabels(leftRows, widthOf(leftRows), leftAt ?? 0)
  const rightLabels = headerLabels(rightRows, widthOf(rightRows), rightAt ?? 0)
  const byPosition = { columns: positional(leftLabels, rightLabels), headerRows: null }
  if (leftAt === null || rightAt === null) return byPosition
  const byHeader = lcsOps(leftLabels, rightLabels)
  // Pairing a minority of the columns means the row was data, not headers —
  // `row-0 | v0` against `row-0 | w0` dropped column B out of the diff entirely.
  const paired = pairedColumns(byHeader).length
  const narrower = Math.min(leftLabels.length, rightLabels.length)
  return paired * 2 > narrower
    ? { columns: byHeader, headerRows: { left: leftAt, right: rightAt } }
    : byPosition
}

/**
 * Pair the two sheets' columns into one display order.
 * @returns {Array<{left: number|null, right: number|null, name: string}>}
 *   `left`/`right` index into that side's own rows; null means the column is
 *   absent there and renders as a ghost.
 */
export function alignColumns(leftRows = [], rightRows = []) {
  return headerPairing(leftRows, rightRows).columns
}

/** The aligned columns present on BOTH sides — the ones a diff can compare. */
export function pairedColumns(columns) {
  return columns.filter((c) => c.left !== null && c.right !== null)
}
