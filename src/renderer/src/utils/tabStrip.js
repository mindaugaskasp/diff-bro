// Scroll state for the tab strip. Pure, so the chevrons' appearance is decided
// by arithmetic that can be tested rather than by whatever the DOM reported on
// the frame the component happened to look.

// Sub-pixel slack. scrollWidth and clientWidth disagree by fractions on a fresh
// layout, which showed the chevrons on a strip that had nothing to scroll.
const EPSILON = 1

/**
 * @param {{ scrollLeft: number, scrollWidth: number, clientWidth: number }|null} el
 * @returns {{ overflowing: boolean, atStart: boolean, atEnd: boolean }}
 */
export function stripScroll(el) {
  const { scrollLeft = 0, scrollWidth = 0, clientWidth = 0 } = el ?? {}
  const overflowing = scrollWidth - clientWidth > EPSILON
  if (!overflowing) return { overflowing: false, atStart: true, atEnd: true }
  return {
    overflowing: true,
    atStart: scrollLeft <= EPSILON,
    atEnd: scrollLeft >= scrollWidth - clientWidth - EPSILON
  }
}
