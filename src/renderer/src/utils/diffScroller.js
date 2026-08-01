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
 * @property {() => Element|null} viewportEl  the box the picture is cut from
 * @property {() => number} [hiddenColumns]   content wider than the viewport,
 *                          in whole screenfuls — a picture cannot reach it
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
    viewportEl: () => paneOf().getDomNode?.() ?? null,
    selection: () => {
      for (const pane of panesOf()) {
        const band = selectedBand(pane)
        if (band) return band
      }
      return null
    }
  }
}

/**
 * A DiffScroller over a plain scrolling element — the spreadsheet grids, the
 * structure list, anything that is not Monaco. Same contract, so the export
 * scrolls and stitches it exactly as it does a tall diff, and a virtualized
 * list (which keeps no offscreen rows either) works for the same reason.
 * @param {() => Element|null} elOf  read lazily: the element outlives no re-render
 * @returns {DiffScroller}
 */
export function elementScroller(elOf) {
  const el = () => elOf() ?? { scrollHeight: 0, clientHeight: 0, scrollTop: 0 }
  return {
    contentHeight: () => el().scrollHeight,
    viewportHeight: () => el().clientHeight,
    scrollTop: () => el().scrollTop,
    scrollTo: (top) => {
      const node = elOf()
      if (node) node.scrollTop = top
    },
    viewportEl: () => elOf(),
    // Selecting lines is a Monaco idea; a grid has no equivalent, so a picture
    // of one is always the whole thing.
    selection: () => null,
    // Stitching only scrolls DOWN. A grid wider than the window would be cut
    // off at the right edge with nothing to show for it, so the count is
    // reported rather than the loss being silent.
    hiddenColumns: () => {
      const node = elOf()
      if (!node?.clientWidth) return 0
      return Math.max(0, Math.ceil((node.scrollWidth - node.clientWidth) / node.clientWidth))
    }
  }
}
