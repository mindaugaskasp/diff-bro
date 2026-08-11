// Where a side's take buttons sit: one per region that side contains, at the top
// of its band, on the pane's INNER edge — against the result it moves text into.
// Monaco's glyph margin, which this replaces, only exists on an editor's LEFT
// edge and cannot be reached from the keyboard at all.

// Half the button — --chip-h in tokens.css — so one straddling the top edge
// still reads as clickable.
const BLEED = 10

/**
 * @param {object} view
 * @param {Array<{line: number, count: number}|null>} view.anchors  from mergeGutter
 * @param {(line: number) => number} view.topOf  the editor's own line geometry
 * @param {number} view.scrollTop
 * @param {number} view.height  the pane's visible height
 * @param {number} view.current  the region the reader is on
 * @returns {Array<{index: number, top: number, dim: boolean}>}
 */
export function takeButtons({ anchors, topOf, scrollTop, height, current }) {
  const out = []
  ;(anchors ?? []).forEach((anchor, index) => {
    // A side that deleted these lines has no band here and nothing to take.
    if (!anchor) return
    const top = Math.round(topOf(anchor.line) - scrollTop)
    // Outside the viewport it would still be in the DOM and still focusable,
    // which is how an overlay button ends up floating over a header.
    if (top < -BLEED || top > height) return
    out.push({ index, top, dim: index !== current })
  })
  return out
}
