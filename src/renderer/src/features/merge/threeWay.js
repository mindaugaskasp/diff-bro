// The two sides, reconstructed from a file's own conflict markers. Only used
// when git's index cannot supply them — a mergetool invoked by hand, or a file
// with no index entry. Pure.

/**
 * Each side as it would read with every conflict resolved that way, so the
 * panes show whole files rather than fragments.
 * @param {object} parsed  from utils/mergeConflicts
 * @returns {{ours: string, theirs: string}}
 */
export function sidesFromConflicts(parsed) {
  if (!parsed) return { ours: '', theirs: '' }
  // RAW lines, each carrying the ending it arrived with, concatenated rather
  // than re-joined: joining trimmed lines drops the file's trailing newline and
  // rewrites CRLF as LF, and a merge tool that reformats the file it resolves
  // is one nobody trusts twice.
  const pick = (key) =>
    parsed.segments.flatMap((seg) => (seg.type === 'stable' ? seg.raw : seg[key])).join('')
  return { ours: pick('oursRaw'), theirs: pick('theirsRaw') }
}

/**
 * Where each conflict sits in the result the view OPENS with — stable text plus
 * our side in every conflicted place. 1-based, and `count: 0` where our side
 * deleted the lines, which still needs somewhere to put the marker.
 * @returns {Array<{line: number, count: number}>}
 */
export function initialRanges(parsed) {
  const out = []
  let line = 1
  for (const seg of parsed?.segments ?? []) {
    if (seg.type === 'stable') {
      line += seg.lines.length
      continue
    }
    out.push({ line, count: seg.ours.length })
    line += seg.ours.length
  }
  return out
}

/**
 * What each answer puts in a region's place. Both keeps the file's own order —
 * ours came first in it.
 * @returns {string[]|null} null for an answer that is not one of the four
 */
export const linesFor = (region, choice) =>
  ({
    ours: region.ours,
    theirs: region.theirs,
    both: [...region.ours, ...region.theirs],
    neither: []
  })[choice] ?? null
