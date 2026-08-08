// Where the hover preview card sits relative to the row that summoned it, and
// how wide it may be there.
//
// Pure, because the interesting part is the fallback chain and that is exactly
// what was wrong: the card preferred the row's right, flipped to its left when
// it did not fit, and then clamped a negative left to the viewport edge. With a
// WIDENED sidebar the row starts near x=0, so the flip always went negative and
// the card landed on top of the list it was previewing.
//
// The card is deliberately large now, which on a normal window does not fit
// beside a row at all. So width is an OUTPUT: it shrinks into the space the
// chosen side actually has, down to a floor. Taking the space it wants is the
// one thing that would put it back over the sidebar.

const MARGIN = 8

/**
 * @param {{ rect: {left:number,right:number,top:number},
 *           viewport: {width:number,height:number},
 *           width: number, minWidth?: number, gap?: number, reserve?: number }} spec
 * @returns {{ left: string, top: string, maxWidth: string }} inline style for a fixed card
 */
export function previewCardPosition({
  rect,
  viewport,
  width,
  minWidth = 320,
  gap = MARGIN,
  reserve = 480
}) {
  const roomRight = viewport.width - (rect.right + gap) - MARGIN
  const roomLeft = rect.left - gap - MARGIN

  let left
  let fitted
  if (roomRight >= minWidth) {
    fitted = Math.min(width, roomRight)
    left = rect.right + gap
  } else if (roomLeft >= minWidth) {
    fitted = Math.min(width, roomLeft)
    left = rect.left - gap - fitted
  } else {
    // Nowhere clears the row; sit at the far edge rather than over the list.
    fitted = Math.min(width, Math.max(minWidth, viewport.width - 2 * MARGIN))
    left = viewport.width - fitted - MARGIN
  }

  const top = Math.min(rect.top, viewport.height - Math.min(reserve, viewport.height - 2 * MARGIN))
  // maxWidth, not width: binding width made `.fit`'s `max-content` unreachable.
  return {
    left: `${Math.max(MARGIN, left)}px`,
    top: `${Math.max(MARGIN, top)}px`,
    maxWidth: `${Math.round(fitted)}px`
  }
}
