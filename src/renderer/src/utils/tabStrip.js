// Whether the tab strip has more tabs than it can show. Pure, so the chevrons'
// appearance is decided by arithmetic that can be tested rather than by
// whatever the DOM reported on the frame the component happened to look.

// Sub-pixel slack. scrollWidth and clientWidth disagree by fractions on a fresh
// layout, which showed the chevrons on a strip that had nothing to scroll.
const EPSILON = 1

/**
 * @param {{ scrollWidth: number, clientWidth: number }|null} el
 * @returns {boolean}
 */
export function isOverflowing(el) {
  const { scrollWidth = 0, clientWidth = 0 } = el ?? {}
  return scrollWidth - clientWidth > EPSILON
}
