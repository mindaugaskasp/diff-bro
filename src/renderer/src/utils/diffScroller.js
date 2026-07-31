// The one handle onto Monaco's scroll state. Exporting a tall diff has to
// scroll the editor between shots, and only DiffViewer holds the editor
// instance — it registers this on mount and drops it on unmount, so the store
// can drive the scroll without importing a component.

/**
 * @typedef {object} DiffScroller
 * @property {() => number} contentHeight   the whole diff's height in CSS px
 * @property {() => number} viewportHeight  the visible pane's height
 * @property {() => number} scrollTop
 * @property {(top: number) => void} scrollTo
 * @property {() => ({ top: number, bottom: number } | null)} selection
 */

/** @type {DiffScroller | null} */
let scroller = null

/** @param {DiffScroller | null} api */
export function setDiffScroller(api) {
  scroller = api
}

/** @returns {DiffScroller | null} */
export function getDiffScroller() {
  return scroller
}

/**
 * The lines selected in a pane, as the content-pixel band they occupy. Both
 * panes of a diff editor scroll as one, so a band read from either is valid for
 * the picture. An empty selection (a bare caret from a click) is not a choice of
 * lines and reads as none.
 * @param {object} pane  a Monaco code editor
 * @returns {{ top: number, bottom: number } | null}
 */
export function selectedBand(pane) {
  const sel = pane?.getSelection?.()
  if (!sel || sel.isEmpty?.()) return null
  const first = Math.min(sel.startLineNumber, sel.endLineNumber)
  const last = Math.max(sel.startLineNumber, sel.endLineNumber)
  const top = pane.getTopForLineNumber(first)
  const bottom = pane.getTopForLineNumber(last + 1)
  return bottom > top ? { top, bottom } : null
}

/**
 * A DiffScroller over a whole diff editor: it scrolls by the modified pane and
 * reads the selection from whichever pane the reader last used.
 *
 * Each pane keeps its own selection, and neither clears the other's, so simply
 * scanning them in a fixed order returns the one that selected FIRST — after
 * exporting a range on the right, selecting on the left re-exported the right
 * pane's stale lines. Following the last cursor change is what "the selection"
 * actually means to the reader, and it makes collapsing to a caret mean none.
 * @param {() => object} editorOf
 * @returns {DiffScroller}
 */
export function monacoDiffScroller(editorOf) {
  const panesOf = () => [editorOf().getModifiedEditor(), editorOf().getOriginalEditor()]
  let latest = null
  for (const pane of panesOf()) pane.onDidChangeCursorSelection?.(() => (latest = pane))
  const scroller = monacoScroller(() => editorOf().getModifiedEditor(), panesOf)
  return {
    ...scroller,
    // Before either pane has been touched there is nothing more recent to go on,
    // so fall back to scanning — a selection can predate this scroller.
    selection: () => (latest ? selectedBand(latest) : scroller.selection())
  }
}

/**
 * A DiffScroller over a single Monaco pane, read lazily so it survives a model
 * swap.
 * @param {() => object} paneOf   the editor whose scroll state stands for the diff
 * @param {() => object[]} [panesOf]  panes to scan for a selection
 * @returns {DiffScroller}
 */
export function monacoScroller(paneOf, panesOf = () => [paneOf()]) {
  return {
    contentHeight: () => paneOf().getScrollHeight(),
    viewportHeight: () => paneOf().getLayoutInfo().height,
    scrollTop: () => paneOf().getScrollTop(),
    scrollTo: (top) => paneOf().setScrollTop(top),
    selection: () => {
      for (const pane of panesOf()) {
        const band = selectedBand(pane)
        if (band) return band
      }
      return null
    }
  }
}
