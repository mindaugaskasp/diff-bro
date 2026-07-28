// Pure geometry for the floating quick look-up window — kept out of the
// Electron-importing glue (quickLook.js) so it unit-tests without a display
// server, the same split CLAUDE.md mandates for sealing.js vs share.js. Given
// the active display's work area and the window size, it places the window
// Spotlight-style: horizontally centred, sitting in the upper third.

// Fraction of the free vertical space left ABOVE the window — a bit above
// centre, where a launcher is expected to appear, not dead-centre on screen.
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
 * The accelerator to register: the stored one when it's a non-empty string, else
 * the fallback. Deep validity is enforced where it's registered (Electron throws
 * on a bad accelerator, caught there); this only guards the empty/missing case
 * so a fresh or hand-cleared settings.json still gets the default binding.
 * @param {unknown} stored
 * @param {string} fallback
 * @returns {string}
 */
export function resolveAccelerator(stored, fallback) {
  return typeof stored === 'string' && stored.trim() ? stored : fallback
}

/**
 * The display whose bounds contain `point`, else the first (primary) display —
 * so the launcher opens on the screen the pointer is on, across a multi-monitor
 * setup. Returns null only when there are no displays at all.
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
