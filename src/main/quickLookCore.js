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
 * Index of the display whose bounds contain `point`, else -1.
 * @param {Array<{bounds:{x:number,y:number,width:number,height:number}}>} displays
 * @param {{x:number,y:number}} point
 * @returns {number}
 */
export function displayIndexForPoint(displays, point) {
  const list = displays ?? []
  if (!point) return -1
  return list.findIndex(
    (d) =>
      point.x >= d.bounds.x &&
      point.x < d.bounds.x + d.bounds.width &&
      point.y >= d.bounds.y &&
      point.y < d.bounds.y + d.bounds.height
  )
}

/**
 * The display whose bounds contain `point`, else the first display, else null.
 * @param {Array<{bounds:{x:number,y:number,width:number,height:number}}>} displays
 * @param {{x:number,y:number}} point
 */
export function displayForPoint(displays, point) {
  const list = displays ?? []
  const i = displayIndexForPoint(list, point)
  return (i >= 0 ? list[i] : list[0]) ?? null
}

const centre = (b) => (b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null)

/**
 * A compact one-line snapshot of the display/window layout at summon/dismiss,
 * for the local diagnostics log (see quickLook.js). Pure so it unit-tests without
 * a display server. The goal is to catch the case where summoning the launcher on
 * one display raises the main window sitting on another.
 * @param {object} o
 * @param {'reveal'|'hide'} o.event
 * @param {Array<{bounds:object}>} o.displays
 * @param {{x:number,y:number}} o.cursor
 * @param {{visible:boolean,minimized:boolean,focused:boolean,bounds:object}|null} [o.main]
 * @param {{x:number,y:number,width:number,height:number}|null} [o.launcher]
 * @returns {string}
 */
export function launcherDiagnostics({ event, displays, cursor, main = null, launcher = null }) {
  const at = (p) => displayIndexForPoint(displays, p)
  const parts = [
    `event=${event}`,
    `displays=${displays?.length ?? 0}`,
    `cursorDisplay=${at(cursor)}`
  ]
  if (main) {
    parts.push(
      `mainVisible=${main.visible}`,
      `mainMinimized=${main.minimized}`,
      `mainFocused=${main.focused}`,
      `mainDisplay=${at(centre(main.bounds))}`
    )
  } else {
    parts.push('main=none')
  }
  if (launcher) parts.push(`launcherDisplay=${at(centre(launcher))}`)
  return parts.join(' ')
}
