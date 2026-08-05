// Diffing two files by their per-line digests instead of their text. The index
// is ~16 bytes a line where the text is hundreds, so an alignment that is
// hopeless over content — a full LCS table over two million-line files is 4 TB —
// is ordinary work over digests.
//
// The shape is patience diff: anchor on lines that occur exactly ONCE on each
// side (those pair unambiguously), recurse into the gaps between anchors, and
// only run the quadratic LCS where a gap is small enough to afford it. A gap
// that is neither anchorable nor affordable degrades to positional alignment,
// which is what a `diff` run already means — row k of the left against row k of
// the right — so the fallback needs no separate code path, only the
// `approximate` flag so the UI can say the alignment is a best effort.

// Cells in an LCS table, matching the precedent in utils/alignRows.js: 4M cells
// of Uint32 is 16 MB, the most worth spending on one gap.
const DEFAULT_LCS_BUDGET = 4_000_000
// Runs, not lines. Past this the remaining gaps are emitted whole rather than
// subdivided, so a pathological file cannot grow the plan without bound.
const DEFAULT_MAX_RUNS = 200_000

const isSameAt = (a, i, b, j) => a.hi[i] === b.hi[j] && a.lo[i] === b.lo[j]

// A Number is exact to 53 bits, so this addresses a BUCKET, not a digest. Every
// candidate it produces is confirmed with the full-width isSameAt above; a bucket
// collision therefore costs an anchor, never a wrong match.
const bucketAt = (side, i) => side.hi[i] * 4294967296 + side.lo[i]

// key -> its only index in [from,to), or -1 once the key repeats.
function soleOccurrences(side, from, to) {
  const seen = new Map()
  for (let i = from; i < to; i++) {
    const key = bucketAt(side, i)
    seen.set(key, seen.has(key) ? -1 : i)
  }
  return seen
}

// Lines unique on BOTH sides of the region, as a flat [i0, j0, i1, j1, …] in
// increasing i. Their j values need not increase — that is what the LIS below
// resolves.
function anchorPairs(a, b, r) {
  const onLeft = soleOccurrences(a, r.ls, r.le)
  const onRight = soleOccurrences(b, r.rs, r.re)
  const pairs = []
  for (let i = r.ls; i < r.le; i++) {
    const key = bucketAt(a, i)
    if (onLeft.get(key) !== i) continue
    const j = onRight.get(key)
    if (j === undefined || j < 0 || !isSameAt(a, i, b, j)) continue
    pairs.push(i, j)
  }
  return pairs
}

// Longest strictly-increasing subsequence of the pairs' j values (patience
// piles + binary search), returned as indices into `pairs`. Anchors must not
// cross, or the runs between them would overlap.
function longestIncreasing(pairs) {
  const n = pairs.length / 2
  if (!n) return []
  const previous = new Int32Array(n).fill(-1)
  const piles = []
  for (let k = 0; k < n; k++) {
    const j = pairs[k * 2 + 1]
    let lo = 0
    let hi = piles.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (pairs[piles[mid] * 2 + 1] < j) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) previous[k] = piles[lo - 1]
    piles[lo] = k
  }
  const chosen = []
  for (let k = piles[piles.length - 1]; k >= 0; k = previous[k]) chosen.push(k)
  return chosen.reverse()
}

// Equal head and tail are peeled off before anything expensive runs: two large
// files usually differ in one region, and this reduces that to the region.
function trimEnds(a, b, r) {
  let { ls, le, rs, re } = r
  let pre = 0
  while (ls < le && rs < re && isSameAt(a, ls, b, rs)) {
    ls++
    rs++
    pre++
  }
  let post = 0
  while (le > ls && re > rs && isSameAt(a, le - 1, b, re - 1)) {
    le--
    re--
    post++
  }
  return { ls, le, rs, re, pre, post }
}

function splitOnAnchors(pairs, chosen, r) {
  const parts = []
  let cursorL = r.ls
  let cursorR = r.rs
  let k = 0
  while (k < chosen.length) {
    const i = pairs[chosen[k] * 2]
    const j = pairs[chosen[k] * 2 + 1]
    let n = 1
    while (
      k + n < chosen.length &&
      pairs[chosen[k + n] * 2] === i + n &&
      pairs[chosen[k + n] * 2 + 1] === j + n
    ) {
      n++
    }
    if (i > cursorL || j > cursorR) {
      parts.push({ t: 'region', ls: cursorL, le: i, rs: cursorR, re: j })
    }
    parts.push({ t: 'same', ls: i, rs: j, n })
    cursorL = i + n
    cursorR = j + n
    k += n
  }
  if (cursorL < r.le || cursorR < r.re) {
    parts.push({ t: 'region', ls: cursorL, le: r.le, rs: cursorR, re: r.re })
  }
  return parts
}

function buildLcsTable(a, b, r) {
  const n = r.le - r.ls
  const m = r.re - r.rs
  const w = m + 1
  const dp = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = isSameAt(a, r.ls + i, b, r.rs + j)
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  return dp
}

// Collects single-line decisions into the fewest runs that describe them.
function createRunBuilder(r) {
  const parts = []
  let sameL = 0
  let sameR = 0
  let sameN = 0
  let diffL = 0
  let diffR = 0
  let delN = 0
  let insN = 0
  const flushSame = () => {
    if (sameN) parts.push({ t: 'same', ls: r.ls + sameL, rs: r.rs + sameR, n: sameN })
    sameN = 0
  }
  const flushDiff = () => {
    if (delN || insN) {
      parts.push({ t: 'diff', ls: r.ls + diffL, ln: delN, rs: r.rs + diffR, rn: insN })
    }
    delN = 0
    insN = 0
  }
  const openDiff = (i, j) => {
    if (!delN && !insN) {
      diffL = i
      diffR = j
    }
  }
  return {
    same(i, j) {
      flushDiff()
      if (!sameN) {
        sameL = i
        sameR = j
      }
      sameN++
    },
    del(i, j) {
      flushSame()
      openDiff(i, j)
      delN++
    },
    ins(i, j) {
      flushSame()
      openDiff(i, j)
      insN++
    },
    tail(i, j, n, m) {
      flushSame()
      if (i < n || j < m) {
        openDiff(i, j)
        delN += n - i
        insN += m - j
      }
    },
    finish() {
      flushSame()
      flushDiff()
      return parts
    }
  }
}

function lcsParts(a, b, r) {
  const n = r.le - r.ls
  const m = r.re - r.rs
  const w = m + 1
  const dp = buildLcsTable(a, b, r)
  const build = createRunBuilder(r)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (isSameAt(a, r.ls + i, b, r.rs + j)) build.same(i++, j++)
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) build.del(i++, j)
    else build.ins(i, j++)
  }
  build.tail(i, j, n, m)
  return build.finish()
}

function planMiddle(a, b, r, ctx) {
  const ln = r.le - r.ls
  const rn = r.re - r.rs
  if (!ln && !rn) return []
  const whole = [{ t: 'diff', ls: r.ls, ln, rs: r.rs, rn }]
  if (!ln || !rn) return whole
  // Every path below is checked against the runs still affordable, counting the
  // ones already queued: without that, one split can enqueue a million parts
  // that no later check will refuse.
  const affordable = ctx.budgetLeft()
  // Exact wherever it fits: anchoring makes a hopeless region tractable, it does
  // not align it better. Patience under-matches an exact LCS, so it is the
  // fallback, never the first choice.
  if (ln * rn <= ctx.lcsBudget && ln + rn <= affordable) return lcsParts(a, b, r)
  const pairs = anchorPairs(a, b, r)
  const chosen = longestIncreasing(pairs)
  if (chosen.length && 2 * chosen.length + 1 <= affordable) {
    return splitOnAnchors(pairs, chosen, r)
  }
  ctx.approximate = true
  return whole
}

function expandRegion(a, b, r, ctx) {
  const inner = trimEnds(a, b, r)
  const parts = []
  if (inner.pre) parts.push({ t: 'same', ls: r.ls, rs: r.rs, n: inner.pre })
  parts.push(...planMiddle(a, b, inner, ctx))
  if (inner.post) parts.push({ t: 'same', ls: inner.le, rs: inner.re, n: inner.post })
  return parts
}

// Adjacent runs of the same kind that touch are one run — the prefix trim and
// the first anchor routinely produce two halves of one stretch.
function absorb(runs, task) {
  const last = runs[runs.length - 1]
  if (last?.t === 'same' && task.t === 'same' && last.ls + last.n === task.ls) {
    last.n += task.n
    return
  }
  if (last?.t === 'diff' && task.t === 'diff' && last.ls + last.ln === task.ls) {
    last.ln += task.ln
    last.rn += task.rn
    return
  }
  runs.push(task)
}

function pack(tasks) {
  const runs = new Int32Array(tasks.length * 5)
  let additions = 0
  let deletions = 0
  tasks.forEach((task, k) => {
    const at = k * 5
    runs[at] = task.t === 'same' ? 1 : 0
    runs[at + 1] = task.ls
    runs[at + 3] = task.rs
    if (task.t === 'same') {
      runs[at + 2] = task.n
      runs[at + 4] = task.n
    } else {
      runs[at + 2] = task.ln
      runs[at + 4] = task.rn
      deletions += task.ln
      additions += task.rn
    }
  })
  return { runs, additions, deletions }
}

/**
 * @typedef {object} DigestSide
 * @property {Uint32Array} hi
 * @property {Uint32Array} lo
 * @property {number} count
 */

/**
 * Align two digest sequences.
 *
 * `runs` is a flat Int32Array of quintuples — [same, leftStart, leftCount,
 * rightStart, rightCount] — deliberately compact so it can cross IPC as one
 * transferable block rather than millions of objects. A `same` run always has
 * equal counts; a `diff` run may have either count at zero (a pure deletion or
 * insertion) and otherwise pairs its lines by position, which is what makes a
 * changed line show up beside its counterpart.
 *
 * @param {DigestSide} left
 * @param {DigestSide} right
 * @param {{ lcsBudget?: number, maxRuns?: number }} [opts]
 * @returns {{ runs: Int32Array, additions: number, deletions: number,
 *   approximate: boolean }}
 */
export function diffDigests(left, right, opts = {}) {
  const tasks = []
  const stack = [{ t: 'region', ls: 0, le: left.count, rs: 0, re: right.count }]
  const maxRuns = opts.maxRuns ?? DEFAULT_MAX_RUNS
  const ctx = {
    approximate: false,
    lcsBudget: opts.lcsBudget ?? DEFAULT_LCS_BUDGET,
    budgetLeft: () => maxRuns - tasks.length - stack.length
  }
  while (stack.length) {
    const task = stack.pop()
    if (task.t !== 'region') {
      absorb(tasks, task)
      continue
    }
    const parts = expandRegion(left, right, task, ctx)
    for (let k = parts.length - 1; k >= 0; k--) stack.push(parts[k])
  }
  return { ...pack(tasks), approximate: ctx.approximate }
}
