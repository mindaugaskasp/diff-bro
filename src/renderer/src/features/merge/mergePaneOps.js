// Everything the three panes DO, over editors handed in rather than created
// here: the decorations, the answers, the scroll sync. Split out of the
// composable so the logic that decides what gets written to a merged file is
// unit-tested instead of only reachable through a launched Electron.
import * as monaco from 'monaco-editor'
import { gutterAnchors } from './mergeGutter'
import { applyChoice, touchedIndexes, wholeLines } from './mergeEdits'
import { regionOptions, rulerColors, sideDecorations } from './mergeDecorations'
import { takeButtons } from './mergeTakeOverlay'

export const SIDES = ['ours', 'result', 'theirs']

const rangeOf = (model, id) => (id ? model.getDecorationRange(id) : null)

/**
 * Where a region sits. A region that holds lines is anchored to the END of its
 * last line; one our side emptied is anchored to a POINT — which is the whole
 * difference, and why it is read back off the anchor rather than remembered
 * beside it. Monaco moves the anchor through every edit, undo included, so
 * nothing here can go stale against the text.
 */
const anchorFor = (line, count, model) =>
  count
    ? new monaco.Range(line, 1, line + count - 1, model.getLineMaxColumn(line + count - 1))
    : new monaco.Range(line, 1, line, 1)

const isPoint = (r) => r.startLineNumber === r.endLineNumber && r.startColumn === r.endColumn

/** Our side deleted these lines, so this is a place to insert rather than replace. */
const isInsertionPoint = (model, id) => {
  const range = rangeOf(model, id)
  return !!range && isPoint(range)
}

// An insertion point holds none of the file, so it reads as nothing — asking the
// model for "its" line would hand back the stable line sitting there.
const regionText = (model, id) => {
  const range = rangeOf(model, id)
  return range && !isPoint(range) ? model.getValueInRange(wholeLines(model, range)) : ''
}

export function repaint({ editors, merge, ids, anchors }) {
  if (!editors.result) return
  const model = editors.result.getModel()
  const colors = rulerColors()
  // Ranges come back OUT of the decorations: the editor has been keeping them
  // right through every edit the reader made.
  const ranges = (ids.result ?? []).map((id) => rangeOf(model, id))
  // The fallback is only reachable if an anchor is destroyed under us, which
  // setValue does. MergeView is keyed by file name so a second launch remounts
  // and re-seeds instead of reaching here.
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
  const ranges = merge.regionLines
  const colors = rulerColors()
  const model = editors.result.getModel()
  ids.result = editors.result.deltaDecorations(
    [],
    ranges.map(({ line, count }, i) => ({
      range: anchorFor(line, count, model),
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
  const range = id && model?.getDecorationRange(id)
  if (!range) return
  const written = applyChoice({
    editor: editors.result,
    model,
    range,
    region: merge.regions[index],
    choice,
    isEmpty: isInsertionPoint(model, id)
  })
  if (written === null) return
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
  ids.result[index] = editors.result.deltaDecorations(
    [ids.result[index]],
    [
      {
        range: anchorFor(start, written, editors.result.getModel()),
        options: regionOptions(merge.regions[index], index === merge.at, rulerColors())
      }
    ]
  )[0]
}

/**
 * Where each side's take buttons go, read off the live editor. Called on every
 * repaint and every scroll — the geometry is Monaco's, the arithmetic is
 * mergeTakeOverlay's.
 */
export function takeLayout({ editors, anchors, merge, key }) {
  const editor = editors[key]
  if (!editor?.getTopForLineNumber) return []
  return takeButtons({
    anchors: anchors[key],
    topOf: (line) => editor.getTopForLineNumber(line),
    scrollTop: editor.getScrollTop(),
    height: editor.getLayoutInfo?.().height ?? 0,
    current: merge.at
  })
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
