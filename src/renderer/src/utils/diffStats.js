/**
 * @typedef {object} LineChange  Monaco's ILineChange
 * @property {number} originalStartLineNumber
 * @property {number} originalEndLineNumber  0 when the change is a pure insertion
 * @property {number} modifiedStartLineNumber
 * @property {number} modifiedEndLineNumber  0 when the change is a pure deletion
 */

/**
 * Added and removed line counts for the toolbar's +/− badges, or null while
 * Monaco has yet to compute the diff.
 *
 * The null is the point. Monaco diffs in a WORKER and hands back null until
 * that returns, so folding null into zeros claimed "no changes" for a moment on
 * every diff opened — long enough to flash the "both sides are identical"
 * banner. An empty array is the real no-changes answer.
 * @param {LineChange[]|null|undefined} changes
 * @returns {{ additions: number, deletions: number } | null}
 */
export function diffLineStats(changes) {
  if (!changes) return null
  let additions = 0
  let deletions = 0
  for (const c of changes) {
    if (c.modifiedEndLineNumber > 0) {
      additions += c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1
    }
    if (c.originalEndLineNumber > 0) {
      deletions += c.originalEndLineNumber - c.originalStartLineNumber + 1
    }
  }
  return { additions, deletions }
}
