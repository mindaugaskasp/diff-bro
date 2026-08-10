// Where a conflict region's lines sit in the SIDE panes, so the chevron that
// moves that side into the result can be put beside them. Pure.
//
// The sides are whole files out of git's index, so a region's lines appear in
// them verbatim — but not at the result's line numbers, because resolving a
// region shifts everything below it.

/**
 * The 1-based line where `lines` next occur in `haystack`, at or after `from`.
 * Searching forward from the previous region keeps two identical hunks in one
 * file from both matching the first occurrence.
 * @returns {number|null}
 */
export function findLines(haystack, lines, from = 1) {
  if (!lines.length) return null
  // The side text is the file as git stores it; a region's lines came through a
  // parser that stripped the ending. Splitting on \n alone leaves a \r on every
  // line of a CRLF file, and nothing ever matches.
  const hay = haystack.split(/\r?\n/)
  for (let i = Math.max(from - 1, 0); i <= hay.length - lines.length; i++) {
    if (lines.every((line, k) => hay[i + k] === line)) return i + 1
  }
  return null
}

/**
 * One entry per region: where it starts in that side's pane, and how many lines
 * it covers. A region the side does not contain (it deleted those lines) gets
 * null and no chevron.
 * @returns {Array<{line: number, count: number}|null>}
 */
export function gutterAnchors(sideText, regions, key) {
  const out = []
  let cursor = 1
  for (const region of regions) {
    const lines = region[key]
    const line = findLines(sideText, lines, cursor)
    out.push(line ? { line, count: lines.length } : null)
    if (line) cursor = line + lines.length
  }
  return out
}
