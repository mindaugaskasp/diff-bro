// Replacing a conflicted region in the result. The region's CURRENT position
// comes from its Monaco decoration, which the editor keeps correct through the
// reader's own edits — a remembered line number would be stale the moment
// anything above it changed.
import * as monaco from 'monaco-editor'
import { linesFor } from './threeWay'

/**
 * The range covering whole lines, so a replacement never leaves half of one.
 *
 * @param {boolean} isEmpty the region holds NO lines — our side deleted them, so
 *   it is a place to insert. A Monaco range cannot say this on its own: an empty
 *   region and a one-line one are both `(n,1)-(n,1)`, and treating the first as
 *   the second overwrote the stable line that happened to sit there.
 */
export function wholeLines(model, range, isEmpty = false) {
  const last = model.getLineCount()
  if (isEmpty) {
    return new monaco.Range(range.startLineNumber, 1, range.startLineNumber, 1)
  }
  return range.endLineNumber >= last
    ? new monaco.Range(range.startLineNumber, 1, last, model.getLineMaxColumn(last))
    : new monaco.Range(range.startLineNumber, 1, range.endLineNumber + 1, 1)
}

/**
 * Which regions no longer read as they did when they were last settled.
 *
 * Typing inside a conflict IS an answer — the case a resolver could not express
 * — so it counts as one rather than leaving Save disabled until a button is
 * pressed as well.
 * @returns {number[]} indexes, in order
 */
export function touchedIndexes(regions, current, settled) {
  const out = []
  regions.forEach((region, i) => {
    if (!region.resolved && current[i] !== settled[i]) out.push(i)
  })
  return out
}

/**
 * Put one answer into the result.
 * @returns {number|null} lines written — 0 leaves the region an insertion point
 *   again — or null for an answer that is not one of the four
 */
export function applyChoice({ editor, model, range, region, choice, isEmpty }) {
  const lines = linesFor(region, choice)
  if (!lines || !range) return null
  const target = wholeLines(model, range, isEmpty)
  const atEnd = target.endLineNumber >= model.getLineCount() && target.endColumn > 1
  // The model's OWN ending, so resolving a region in a CRLF file does not write
  // LF into the middle of it.
  const eol = model.getEOL()
  const text = lines.length ? lines.join(eol) + (atEnd ? '' : eol) : ''
  editor.executeEdits('merge', [{ range: target, text, forceMoveMarkers: false }])
  return lines.length
}
