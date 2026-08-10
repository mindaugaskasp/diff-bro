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

const regionText = (model, id) => {
  const range = rangeOf(model, id)
  return range ? model.getValueInRange(wholeLines(model, range)) : ''
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
export function seedRegions({ editors, merge, ids, settled }) {
  const ranges = initialRanges(parseConflicts(merge.rawContent))
  const colors = rulerColors()
  ids.result = editors.result.deltaDecorations(
    [],
    ranges.map(({ line, count }, i) => ({
      range: new monaco.Range(line, 1, count ? line + count - 1 : line, 1),
      options: regionOptions(merge.regions[i] ?? {}, i === 0, colors)
    }))
  )
  remember({ editors, ids, settled })
}

// What each region reads as while it is settled, so a later edit to one is
// something to compare against rather than something to guess at.
export function remember({ editors, ids, settled }) {
  const model = editors.result?.getModel()
  if (!model) return
  const now = (ids.result ?? []).map((id) => regionText(model, id))
  settled.splice(0, settled.length, ...now)
}

// Hand-editing a conflict answers it. Without this a reader who typed the
// resolution still had to press a button before Save would unlock.
export function resolveTouched({ editors, merge, ids, settled }) {
  const model = editors.result?.getModel()
  if (!model) return
  const current = (ids.result ?? []).map((id) => regionText(model, id))
  const touched = touchedIndexes(merge.regions, current, settled)
  for (const index of touched) merge.markResolved(index)
  if (touched.length) remember({ editors, ids, settled })
}

/** One answer, written where the region currently sits. */
export function writeChoice({ editors, merge, ids, index, choice }) {
  const model = editors.result?.getModel()
  const id = ids.result?.[index]
  if (!model || !id) return
  const wrote = applyChoice({
    editor: editors.result,
    model,
    range: model.getDecorationRange(id),
    region: merge.regions[index],
    choice
  })
  if (wrote) merge.markResolved(index)
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
