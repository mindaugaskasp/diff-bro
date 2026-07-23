// Pure geometry for the corner-resize of the Mermaid viewer panel. No DOM, no
// Vue — the composable (useResizable) owns the pointer wiring; this owns only
// the maths so it stays unit-testable.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Resize a rect by dragging one of its corners, pinning the opposite corner and
 * clamping to a minimum size and the given bounds.
 *
 * @param {object} o
 * @param {import('../types').Rect} o.rect   the rect at drag start
 * @param {'nw'|'ne'|'sw'|'se'} o.corner     which corner is being dragged
 * @param {number} o.dx  pointer x delta since drag start
 * @param {number} o.dy  pointer y delta since drag start
 * @param {{width:number,height:number}} o.min  minimum panel size
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} o.bounds  viewport limits
 * @returns {import('../types').Rect}
 */
export function resizeRect({ rect, corner, dx, dy, min, bounds }) {
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  const west = corner.includes('w')
  const north = corner.includes('n')
  let left, top, width, height

  if (west) {
    // West edge moves; the east edge (right) stays pinned.
    left = clamp(rect.left + dx, bounds.minX, right - min.width)
    width = right - left
  } else {
    left = rect.left
    width = clamp(rect.width + dx, min.width, bounds.maxX - rect.left)
  }
  if (north) {
    top = clamp(rect.top + dy, bounds.minY, bottom - min.height)
    height = bottom - top
  } else {
    top = rect.top
    height = clamp(rect.height + dy, min.height, bounds.maxY - rect.top)
  }
  return { left, top, width, height }
}

/** A rect of the given size centred in a vw×vh viewport. */
export function centeredRect(width, height, vw, vh) {
  return { left: Math.round((vw - width) / 2), top: Math.round((vh - height) / 2), width, height }
}
