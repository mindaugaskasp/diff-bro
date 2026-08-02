// Turning an alignment (the compact run list from main's hashDiff) into the
// rows a reader scrolls, WITHOUT ever materialising them all. A streamed
// comparison can be millions of rows long, so the plan is a cumulative index
// over runs and a row is resolved by binary search on demand.

/**
 * @typedef {object} RowPlan
 * @property {Int32Array} runs    flat quintuples, see hashDiff.diffDigests
 * @property {Int32Array} starts  first display row of each run, plus the total
 * @property {number} total       display rows across the whole comparison
 * @property {number} count       number of runs
 */

/**
 * @typedef {object} StreamRow
 * @property {'same'|'chg'|'del'|'ins'} status
 * @property {number|null} leftLine   0-based line in the left file, or null
 * @property {number|null} rightLine
 */

const SAME = 0
const LEFT_START = 1
const LEFT_COUNT = 2
const RIGHT_START = 3
const RIGHT_COUNT = 4

/**
 * Index an alignment for random access by display row.
 * @param {Int32Array|number[]} runs
 * @returns {RowPlan}
 */
export function buildRowPlan(runs) {
  const source = runs instanceof Int32Array ? runs : Int32Array.from(runs ?? [])
  const count = Math.floor(source.length / 5)
  const starts = new Int32Array(count + 1)
  for (let k = 0; k < count; k++) {
    const at = k * 5
    // A diff run shows both sides side by side, so it is as tall as its taller
    // side; a same run's two counts are equal by construction.
    const rows = source[at + SAME]
      ? source[at + LEFT_COUNT]
      : Math.max(source[at + LEFT_COUNT], source[at + RIGHT_COUNT])
    starts[k + 1] = starts[k] + rows
  }
  return { runs: source, starts, total: starts[count], count }
}

/**
 * The run containing a display row, or -1 when the row is out of range.
 * @param {RowPlan} plan
 * @param {number} row
 * @returns {number}
 */
export function runIndexAt(plan, row) {
  if (!(row >= 0) || row >= plan.total) return -1
  let lo = 0
  let hi = plan.count - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (plan.starts[mid] <= row) lo = mid
    else hi = mid - 1
  }
  return lo
}

function rowInRun(plan, runIndex, offset) {
  const at = runIndex * 5
  const runs = plan.runs
  const leftCount = runs[at + LEFT_COUNT]
  const rightCount = runs[at + RIGHT_COUNT]
  const leftLine = offset < leftCount ? runs[at + LEFT_START] + offset : null
  const rightLine = offset < rightCount ? runs[at + RIGHT_START] + offset : null
  if (runs[at + SAME]) return { status: 'same', leftLine, rightLine }
  if (leftLine !== null && rightLine !== null) return { status: 'chg', leftLine, rightLine }
  return { status: leftLine !== null ? 'del' : 'ins', leftLine, rightLine }
}

/**
 * Resolve display rows [from, to) into per-side line numbers and a status.
 * @param {RowPlan} plan
 * @param {number} from
 * @param {number} to
 * @returns {StreamRow[]}
 */
export function rowsIn(plan, from, to) {
  const start = Math.max(0, from)
  const end = Math.min(plan.total, to)
  if (end <= start) return []
  const out = []
  let run = runIndexAt(plan, start)
  for (let row = start; row < end; row++) {
    // Runs are contiguous, so walking forward beats a search per row.
    while (run + 1 < plan.count && plan.starts[run + 1] <= row) run++
    out.push(rowInRun(plan, run, row - plan.starts[run]))
  }
  return out
}

/**
 * The contiguous line range one side needs to fill these rows, or null when
 * that side has no line in any of them (a block present only on the other side).
 * Line numbers rise monotonically through the rows, so the first and last
 * non-null bound the whole range.
 * @param {StreamRow[]} rows
 * @param {'left'|'right'} side
 * @returns {{ from: number, to: number } | null}
 */
export function lineSpanOf(rows, side) {
  const key = side === 'left' ? 'leftLine' : 'rightLine'
  let first = null
  let last = null
  for (const row of rows) {
    const line = row[key]
    if (line === null) continue
    if (first === null) first = line
    last = line
  }
  return first === null ? null : { from: first, to: last + 1 }
}

/**
 * Display row where a run begins — what "jump to the next change" needs.
 * @param {RowPlan} plan
 * @param {number} runIndex
 * @returns {number}
 */
export const runStartRow = (plan, runIndex) => plan.starts[runIndex] ?? 0

/**
 * Display rows at which each changed block starts, capped so a comparison with
 * a million changes still yields a navigable list.
 * @param {RowPlan} plan
 * @param {number} [limit]
 * @returns {number[]}
 */
export function changeRows(plan, limit = 5000) {
  const out = []
  for (let k = 0; k < plan.count && out.length < limit; k++) {
    if (!plan.runs[k * 5 + SAME]) out.push(plan.starts[k])
  }
  return out
}
