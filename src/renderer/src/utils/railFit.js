/**
 * How many equal-height items fit a box, capped at what there is to show. Each
 * item is measured INCLUDING the gap above it, so `n * item <= height` is the
 * whole of it — no off-by-one that clips the last icon in half.
 * @param {{ height: number, item: number, max: number }} opts
 * @returns {number}
 */
export function fittingCount({ height, item, max }) {
  if (!(height > 0) || !(item > 0)) return 0
  return Math.max(0, Math.min(max, Math.floor(height / item)))
}
