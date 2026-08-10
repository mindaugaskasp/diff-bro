// Everything the three panes DO, over editors handed in rather than created
// here: the decorations, the answers, the scroll sync. Split out of the
// composable so the logic that decides what gets written to a merged file is
// unit-tested instead of only reachable through a launched Electron.
import * as monaco from 'monaco-editor'
import { gutterAnchors } from './mergeGutter'
import { applyChoice, touchedIndexes, wholeLines } from './mergeEdits'
import { regionOptions, rulerColors, sideDecorations } from './mergeDecorations'
import { initialRanges } from './threeWay'
import { parseConflicts } from '../../utils/mergeConflicts'

export const SIDES = ['ours', 'result', 'theirs']

const rangeOf = (model, id) => (id ? model.getDecorationRange(id) : null)

// An insertion point holds none of the file, so it reads as nothing — asking the
// model for "its" line would hand back the stable line sitting there.
const regionText = (model, id, isEmpty) => {
  const range = rangeOf(model, id)
  return range && !isEmpty ? model.getValueInRange(wholeLines(model, range)) : ''
}

export function repaint({ editors, merge, ids, anchors }) {
  if (!editors.result) return
  const model = editors.result.getModel()
  const colors = rulerColors()
  // Ranges come back OUT of the decorations: the editor has been keeping them
  // right through every edit the reader made.
  const ranges = (ids.result ?? []).map((id) => rangeOf(model, id))
  ids.result = editors.result.deltaDecorations(
    ids.result ?? [],
    merge.regions.map((region, i) => ({
      range: ranges[i] ?? new monaco.Range(1, 1, 1, 1),
      options: regionOptions(region, i === merge.at, colors)
    }))
  )
  for (const key of ['ours', 'theirs']) {
    anchors[key] = gutterAnchors(merge[key], merge.regions, key)
    ids[key] = editors[key].deltaDecorations(
      ids[key] ?? [],
      sideDecorations(anchors[key], merge.regions, key, colors)
    )
  }
}

// The regions start where our side put them; from here the editor keeps the
// ranges right and nothing re-parses the text.
export function seedRegions({ editors, merge, ids, settled, empties }) {
  const ranges = initialRanges(parseConflicts(merge.rawContent))
  const colors = rulerColors()
  ids.result = editors.result.deltaDecorations(
    [],
    ranges.map(({ line, count }, i) => ({
      range: new monaco.Range(line, 1, count ? line + count - 1 : line, 1),
      options: regionOptions(merge.regions[i] ?? {}, i === 0, colors)
    }))
  )
  // Which regions our side left with no lines at all. Kept beside the
  // decorations because a Monaco range cannot express it.
  empties.splice(0, empties.length, ...ranges.map(({ count }) => count === 0))
  remember({ editors, ids, settled, empties })
}

// What each region reads as while it is settled, so a later edit to one is
// something to compare against rather than something to guess at.
export function remember({ editors, ids, settled, empties }) {
  const model = editors.result?.getModel()
  if (!model) return
  const now = (ids.result ?? []).map((id, i) => regionText(model, id, empties?.[i]))
  settled.splice(0, settled.length, ...now)
}

// Hand-editing a conflict answers it. Without this a reader who typed the
// resolution still had to press a button before Save would unlock.
export function resolveTouched({ editors, merge, ids, settled, empties }) {
  const model = editors.result?.getModel()
  if (!model) return
  const current = (ids.result ?? []).map((id, i) => regionText(model, id, empties?.[i]))
  const touched = touchedIndexes(merge.regions, current, settled)
  for (const index of touched) merge.markResolved(index)
  if (touched.length) remember({ editors, ids, settled, empties })
}

/** One answer, written where the region currently sits. */
export function writeChoice({ editors, merge, ids, index, choice, empties }) {
  const model = editors.result?.getModel()
  const id = ids.result?.[index]
  const range = id && model?.getDecorationRange(id)
  if (!range) return
  const written = applyChoice({
    editor: editors.result,
    model,
    range,
    region: merge.regions[index],
    choice,
    isEmpty: empties?.[index]
  })
  if (written === null) return
  // Answered: it holds whatever that answer put there, so the NEXT answer
  // replaces it rather than inserting beside it.
  empties[index] = written === 0
  reanchor({ editors, merge, ids, index, start: range.startLineNumber, written })
  merge.markResolved(index)
}

/**
 * Put the region's decoration back over exactly the lines just written.
 *
 * Monaco grows a decoration around inserted text by its own rule, and the result
 * does not mean what these ranges mean — an insert at a zero-length region came
 * back as `(n,1)-(n+1,1)`, which this code reads as TWO lines. Left alone, the
 * next answer to that region deleted the line after it.
 */
function reanchor({ editors, merge, ids, index, start, written }) {
  const last = written ? start + written - 1 : start
  ids.result[index] = editors.result.deltaDecorations(
    [ids.result[index]],
    [
      {
        range: new monaco.Range(start, 1, last, 1),
        options: regionOptions(merge.regions[index], index === merge.at, rulerColors())
      }
    ]
  )[0]
}

// A click in a side's glyph margin answers the region that sits there.
export function takeFromGutter({ anchors, key, event, take }) {
  if (event.target?.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return
  const line = event.target.position?.lineNumber
  const index = anchors[key].findIndex((a) => a && line >= a.line && line <= a.line + a.count - 1)
  if (index >= 0) take(index, key)
}

/** Bring a region into view and put the caret on it. */
export function reveal({ editors, ids, index }) {
  const model = editors.result?.getModel()
  const range = ids.result?.[index] && model?.getDecorationRange(ids.result[index])
  if (!range) return
  editors.result.revealLineInCenter(range.startLineNumber)
  editors.result.setPosition({ lineNumber: range.startLineNumber, column: 1 })
  editors.result.focus()
}

// One pane scrolled; the others follow. The flag stops the echo.
export function syncScroll(editors, from, sync) {
  if (sync.busy || !editors[from]) return
  sync.busy = true
  const top = editors[from].getScrollTop()
  for (const side of SIDES) {
    if (side !== from) editors[side]?.setScrollTop(top)
  }
  sync.busy = false
}
