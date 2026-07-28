// Line-level LCS → git-style unified diff (must apply cleanly with `git apply`,
// so it's computed here, not scraped from Monaco). Pure + unit-tested.

const CONTEXT = 3

// Guards the O(n·m) table (also keeps depths under Uint16, so the table is one).
export const MAX_DIFF_LINES = 4000

// Drop a single trailing newline so a file ending in "\n" has no phantom line.
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

// Tag each line with 1-based old/new line numbers (null where it doesn't exist).
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

// Hunk header counts + start numbers (0 when a side contributes nothing).
function renderHunk(slice) {
  const olds = slice.filter((l) => l.oldNo != null)
  const news = slice.filter((l) => l.newNo != null)
  const oldStart = olds.length ? olds[0].oldNo : 0
  const newStart = news.length ? news[0].newNo : 0
  const head = `@@ -${oldStart},${olds.length} +${newStart},${news.length} @@\n`
  return head + slice.map((l) => l.sign + l.text).join('\n') + '\n'
}

// Group changes into hunks with CONTEXT lines of padding; nearby changes merge.
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

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/

// Parse the hunks out of a unified diff, ignoring the ---/+++ file headers and
// anything before the first @@. Body lines are context (' '), deletions ('-')
// or additions ('+'); an empty context line is a single space, so a bare ''
// (e.g. the split's trailing element) is not part of a hunk. null if there is
// no hunk at all.
function parseHunks(patchText) {
  const hunks = []
  let cur = null
  for (const line of patchText.split('\n')) {
    const m = HUNK_HEADER.exec(line)
    if (m) {
      cur = { oldStart: Number(m[1]), lines: [] }
      hunks.push(cur)
    } else if (cur && (line[0] === ' ' || line[0] === '+' || line[0] === '-')) {
      cur.lines.push(line)
    }
  }
  return hunks.length ? hunks : null
}

// Apply a unified diff to a base string. Exact-match only: a hunk whose context
// or deletions don't match the base is REJECTED (its index returned) and the
// rest still apply — never a silent wrong result. Returns { output, rejected }
// or { error } when the text carries no hunk. Line numbering follows
// toUnifiedDiff's model (a single trailing newline is not its own line).
export function applyUnifiedDiff(baseText, patchText) {
  const hunks = parseHunks(patchText)
  if (!hunks) return { error: 'not-a-unified-diff' }
  const out = splitLines(baseText)
  const rejected = []
  let offset = 0
  hunks.forEach((hunk, index) => {
    const at = Math.max(0, hunk.oldStart - 1 + offset)
    let p = at
    let ok = true
    const replacement = []
    for (const bodyLine of hunk.lines) {
      const text = bodyLine.slice(1)
      if (bodyLine[0] === '+') {
        replacement.push(text)
      } else if (out[p] === text) {
        if (bodyLine[0] === ' ') replacement.push(text)
        p++
      } else {
        ok = false
        break
      }
    }
    if (!ok) {
      rejected.push(index)
      return
    }
    out.splice(at, p - at, ...replacement)
    offset += replacement.length - (p - at)
  })
  let output = out.join('\n')
  // Follow the base's newline convention; content added to an empty file yields
  // a normal newline-terminated file (the patch itself can't encode this — the
  // app's diffs carry no "\ No newline at end of file" marker).
  if ((baseText.endsWith('\n') || baseText === '') && output.length) output += '\n'
  return { output, rejected }
}
