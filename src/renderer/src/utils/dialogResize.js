// Pure geometry for resizing a CENTERED dialog: it grows symmetrically about the
// centre, so the cursor delta counts double on the handle's axis to keep the
// dragged edge under the cursor.

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

// handle is one of n, s, e, w and the corners ne, nw, se, sw. dx/dy are the
// cursor's movement from the press point. Returns the clamped { width, height }.
export function resizeCentered({ handle, startW, startH, dx, dy, min, max }) {
  let width = startW
  let height = startH
  if (handle.includes('e')) width = startW + 2 * dx
  if (handle.includes('w')) width = startW - 2 * dx
  if (handle.includes('s')) height = startH + 2 * dy
  if (handle.includes('n')) height = startH - 2 * dy
  return {
    width: Math.round(clamp(width, min.width, max.width)),
    height: Math.round(clamp(height, min.height, max.height))
  }
}

// The eight drag handles, in a fixed order for the template.
export const RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
