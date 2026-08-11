// What the three panes draw: the region bands, the gutter chevrons, the marks
// in the scrollbar that say where the rest of the conflicts are, and the
// intra-line tint that narrows a whole band down to the words that differ.
//
// Pure builders — they take positions and colours and give back decorations.
import * as monaco from 'monaco-editor'
import { t } from '../../i18n'
import { wordSpans } from './mergeWords'

const FULL = monaco.editor.OverviewRulerLane.Full

const ruler = (color) => ({ color, position: FULL })

/**
 * The scrollbar marks are painted on a canvas, so they take a colour and not a
 * token. Resolved through a probe rather than read off the root: several --dg-*
 * are `color-mix()`, which getPropertyValue hands back unevaluated.
 */
export function rulerColors() {
  const probe = document.createElement('span')
  probe.style.cssText = 'display:none'
  document.body.appendChild(probe)
  const of = (token, fallback) => {
    probe.style.color = `var(${token})`
    return getComputedStyle(probe).color || fallback
  }
  const colors = {
    open: of('--dg-chg', '#c08a2e'),
    done: of('--dg-add', '#2e8b57'),
    ours: of('--dg-del', '#b3402f'),
    theirs: of('--dg-add', '#2e8b57')
  }
  probe.remove()
  return colors
}

/** A region in the result: still to decide, settled, or the one being worked on. */
export const regionOptions = (region, isCurrent, colors) => ({
  isWholeLine: true,
  className: region.resolved
    ? 'merge-region resolved'
    : isCurrent
      ? 'merge-region current'
      : 'merge-region',
  linesDecorationsClassName: region.resolved ? 'merge-region-done' : 'merge-region-edge',
  overviewRuler: ruler(region.resolved ? colors.done : colors.open)
})

// Each side keeps its own colour rather than borrowing the middle's: three tints
// of the same one would have to be told apart, and the middle's is about state.
const bandOptions = (key, colors) => ({
  isWholeLine: true,
  className: `merge-side-${key}`,
  linesDecorationsClassName: `merge-edge-${key}`,
  // Pointing INWARD, so the direction of the chevron is the direction of the move.
  glyphMarginClassName: `merge-take merge-take-${key}`,
  glyphMarginHoverMessage: {
    value: t(key === 'ours' ? 'merge.takeOursTip' : 'merge.takeTheirsTip')
  },
  overviewRuler: ruler(colors[key])
})

const wordOptions = (key) => ({ className: `merge-word merge-word-${key}`, stickiness: 1 })

/**
 * A side pane's decorations: the band beside each region it contains, and inside
 * it the columns that differ from the other side.
 * @param {Array<{line: number, count: number}|null>} anchors from mergeGutter
 */
export function sideDecorations(anchors, regions, key, colors) {
  const out = []
  anchors.forEach((anchor, i) => {
    if (!anchor) return
    out.push({
      range: new monaco.Range(anchor.line, 1, anchor.line + anchor.count - 1, 1),
      options: bandOptions(key, colors)
    })
    for (const { row, span } of wordSpans(regions[i])[key]) {
      out.push({
        range: new monaco.Range(anchor.line + row, span[0], anchor.line + row, span[1]),
        options: wordOptions(key)
      })
    }
  })
  return out
}
