// What actually differs INSIDE a conflicted line. A region tinted whole tells
// the reader two versions exist; this tells them the change is one digit.
// Pure — columns only, no editor.

/**
 * Where two lines stop agreeing, as 1-based column pairs on each. The shared
 * head and tail are peeled off, which is what leaves the words that changed.
 * @returns {{ours: number[], theirs: number[]}|null} null when they agree
 */
export function lineSpans(a, b) {
  if (a === b) return null
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  const room = (s) => s.length - head
  while (tail < room(a) && tail < room(b) && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
    tail++
  }
  return { ours: [head + 1, a.length - tail + 1], theirs: [head + 1, b.length - tail + 1] }
}

/**
 * One entry per line of the region, for each side.
 *
 * Only when the two sides have the SAME number of lines: pairing line 3 against
 * line 3 says nothing once a side has added or removed one, and hunk granularity
 * is the stated limit — an intra-region line diff is a different feature.
 * @returns {{ours: Array<{row: number, span: number[]}>, theirs: Array<...>}}
 */
export function wordSpans(region) {
  const empty = { ours: [], theirs: [] }
  const ours = region?.ours ?? []
  const theirs = region?.theirs ?? []
  if (!ours.length || ours.length !== theirs.length) return empty
  return ours.reduce((out, line, row) => {
    const spans = lineSpans(line, theirs[row])
    if (spans) {
      out.ours.push({ row, span: spans.ours })
      out.theirs.push({ row, span: spans.theirs })
    }
    return out
  }, empty)
}
