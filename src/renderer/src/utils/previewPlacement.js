// Where the hover preview card sits relative to the row that summoned it.
//
// Pure, because the interesting part is the fallback chain and that is exactly
// what was wrong: the card preferred the row's right, flipped to its left when
// it did not fit, and then clamped a negative left to the viewport edge. With a
// WIDENED sidebar the row starts near x=0, so the flip always went negative and
// the card landed on top of the list it was previewing.

const MARGIN = 8

/**
 * @param {{ rect: {left:number,right:number,top:number},
 *           viewport: {width:number,height:number},
 *           width: number, gap?: number, reserve?: number }} spec
 * @returns {{ left: string, top: string }} inline style for a fixed-position card
 */
export function previewCardPosition({ rect, viewport, width, gap = MARGIN, reserve = 480 }) {
  const rightOfRow = rect.right + gap
  const leftOfRow = rect.left - width - gap
  const lastResort = viewport.width - width - MARGIN

  let left
  if (rightOfRow + width <= viewport.width - MARGIN) left = rightOfRow
  // Only when it fits WHOLE on that side — a partial fit is what used to be
  // clamped into the sidebar.
  else if (leftOfRow >= MARGIN) left = leftOfRow
  else left = lastResort

  const top = Math.min(rect.top, viewport.height - Math.min(reserve, viewport.height - 2 * MARGIN))
  return { left: `${Math.max(MARGIN, left)}px`, top: `${Math.max(MARGIN, top)}px` }
}
