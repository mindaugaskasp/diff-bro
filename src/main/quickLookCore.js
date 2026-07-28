// Pure geometry for the quick look-up window, kept out of the Electron glue
// (quickLook.js) so it unit-tests without a display server.

// Fraction of the free vertical space left above the window — a launcher sits a
// bit above centre, not dead-centre.
const TOP_FRACTION = 0.28

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)))

/**
 * @param {{x:number,y:number,width:number,height:number}} workArea
 * @param {{width:number,height:number}} win
 * @returns {{x:number,y:number}} integer top-left, clamped inside the work area
 */
export function placeWindow(workArea, win) {
  const x = workArea.x + Math.round((workArea.width - win.width) / 2)
  const y = workArea.y + Math.round((workArea.height - win.height) * TOP_FRACTION)
  return {
    x: clamp(x, workArea.x, workArea.x + workArea.width - win.width),
    y: clamp(y, workArea.y, workArea.y + workArea.height - win.height)
  }
}

/**
 * The stored accelerator when it's a non-empty string, else the fallback. Deep
 * validity is enforced where it's registered (Electron throws, caught there).
 * @param {unknown} stored
 * @param {string} fallback
 * @returns {string}
 */
export function resolveAccelerator(stored, fallback) {
  return typeof stored === 'string' && stored.trim() ? stored : fallback
}

/**
 * The display whose bounds contain `point`, else the first display, else null.
 * @param {Array<{bounds:{x:number,y:number,width:number,height:number}}>} displays
 * @param {{x:number,y:number}} point
 */
export function displayForPoint(displays, point) {
  const list = displays ?? []
  const hit = list.find(
    (d) =>
      point.x >= d.bounds.x &&
      point.x < d.bounds.x + d.bounds.width &&
      point.y >= d.bounds.y &&
      point.y < d.bounds.y + d.bounds.height
  )
  return hit ?? list[0] ?? null
}
