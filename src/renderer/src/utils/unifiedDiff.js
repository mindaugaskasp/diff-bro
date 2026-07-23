// Line-level LCS → git-style unified diff. Pure and unit-tested.
//
// The on-screen diff is Monaco's; a *copied* patch has a higher bar — it must
// apply cleanly with `patch`/`git apply` — so we compute our own line diff with
// well-defined semantics here rather than scraping the editor's change list.

const CONTEXT = 3

// Guard the O(n·m) LCS table: past this the transient memory/time isn't worth it
// for a clipboard convenience, and the caller shows a notice instead. LCS depths
// stay below Uint16's ceiling at this cap, so the table can be a Uint16Array.
export const MAX_DIFF_LINES = 4000

// Drop a single trailing newline so a file ending in "\n" doesn't yield a
// phantom empty final line; every real line is preserved otherwise.
function splitLines(text) {
  const t = text.endsWith('\n') ? text.slice(0, -1) : text
  return t.length === 0 ? [] : t.split('\n')
}

// Classic LCS edit script: 'eq' | 'del' | 'add', in output order.
function lcsOps(a, b) {
  const n = a.length
  const m = b.length
  const w = m + 1
  const dp = new Uint16Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] =
        a[i] === b[j]
          ? dp[(i + 1) * w + (j + 1)] + 1
          : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ sign: ' ', text: a[i] })
      i++
      j++
    } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
      ops.push({ sign: '-', text: a[i++] })
    } else {
      ops.push({ sign: '+', text: b[j++] })
    }
  }
  while (i < n) ops.push({ sign: '-', text: a[i++] })
  while (j < m) ops.push({ sign: '+', text: b[j++] })
  return ops
}

// Tag each emitted line with the 1-based old/new line numbers it occupies
// (null on the side where it doesn't exist).
function annotate(ops) {
  let oldNo = 1
  let newNo = 1
  return ops.map((op) => {
    const line = { sign: op.sign, text: op.text, oldNo: null, newNo: null }
    if (op.sign !== '+') line.oldNo = oldNo++
    if (op.sign !== '-') line.newNo = newNo++
    return line
  })
}

// A hunk header counts context+deletions on the old side, context+additions on
// the new side; start numbers come from the first real line on each side (0 when
// a side contributes nothing, e.g. a file created from empty).
function renderHunk(slice) {
  const olds = slice.filter((l) => l.oldNo != null)
  const news = slice.filter((l) => l.newNo != null)
  const oldStart = olds.length ? olds[0].oldNo : 0
  const newStart = news.length ? news[0].newNo : 0
  const head = `@@ -${oldStart},${olds.length} +${newStart},${news.length} @@\n`
  return head + slice.map((l) => l.sign + l.text).join('\n') + '\n'
}

// Group changed lines into hunks, padding each with up to CONTEXT unchanged
// lines; changes closer than 2·CONTEXT lines share a hunk (their context would
// otherwise overlap).
function buildHunks(lines) {
  const changed = []
  lines.forEach((l, i) => {
    if (l.sign !== ' ') changed.push(i)
  })
  if (!changed.length) return []
  const clusters = [[changed[0]]]
  for (let k = 1; k < changed.length; k++) {
    const last = clusters[clusters.length - 1]
    if (changed[k] - last[last.length - 1] <= 2 * CONTEXT + 1) last.push(changed[k])
    else clusters.push([changed[k]])
  }
  return clusters.map((cluster) => {
    const start = Math.max(0, cluster[0] - CONTEXT)
    const end = Math.min(lines.length - 1, cluster[cluster.length - 1] + CONTEXT)
    return renderHunk(lines.slice(start, end + 1))
  })
}

// Returns { patch } — '' when the two sides are identical — or { error }.
export function toUnifiedDiff(
  leftText,
  rightText,
  { leftLabel = 'original', rightLabel = 'changed' } = {}
) {
  const a = splitLines(leftText)
  const b = splitLines(rightText)
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) return { error: 'too-large' }
  const hunks = buildHunks(annotate(lcsOps(a, b)))
  if (!hunks.length) return { patch: '' }
  return { patch: `--- ${leftLabel}\n+++ ${rightLabel}\n${hunks.join('')}` }
}
