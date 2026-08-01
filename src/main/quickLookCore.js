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

/**
 * Whether the app is running with no main window. Counting windows is wrong: the
 * launcher is kept warm and rebuilt on the next shortcut press, so on macOS —
 * where closing the main window leaves the app alive — the count never returns
 * to zero and the main window is never reopened.
 * @param {Array<unknown>} windows
 * @param {unknown} launcher
 * @returns {boolean}
 */
export function needsMainWindow(windows, launcher) {
  return !(windows ?? []).some((w) => w && w !== launcher)
}

/**
 * How the launcher must be told to escape its own Space, or null where that has
 * no meaning. `alwaysOnTop: true` alone leaves a macOS window inside the app's
 * Space, so the shortcut appears to do nothing over a full-screen app — the
 * window has to join all Spaces as a full-screen auxiliary, above that app.
 * @param {string} platform
 * @returns {{level:string,visibleOnAllWorkspaces:boolean,visibleOnFullScreen:boolean}|null}
 */
export function launcherSpaceBehavior(platform) {
  if (platform !== 'darwin') return null
  return { level: 'screen-saver', visibleOnAllWorkspaces: true, visibleOnFullScreen: true }
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

// Mirrors utils/accelerator.js in the renderer, which cannot be imported across
// the process split. settingsStore says main guards its own registration — this
// is that guard, and tests/main/quickLookCore.test.js pins the two together.
const MODIFIERS = ['CommandOrControl', 'Alt', 'Shift', 'Super']

/**
 * A binding worth registering GLOBALLY needs at least one modifier plus exactly
 * one non-modifier key — a bare key would hijack that key system-wide.
 * @param {unknown} str
 * @returns {boolean}
 */
export function isValidAccelerator(str) {
  if (typeof str !== 'string' || !str) return false
  const parts = str.split('+')
  const mods = parts.filter((p) => MODIFIERS.includes(p))
  const keys = parts.filter((p) => !MODIFIERS.includes(p))
  return mods.length >= 1 && keys.length === 1 && keys[0].length > 0
}

/**
 * Move the global shortcut to `next`, keeping `current` alive unless the
 * replacement actually takes. Registering FIRST is the point: dropping the old
 * binding up front left the launcher unreachable whenever the new accelerator
 * was already owned by another app, while the UI still showed the old one.
 * @param {object} opts
 * @param {string|null} opts.current
 * @param {unknown} opts.next
 * @param {(accel: string) => boolean} opts.register
 * @param {(accel: string) => void} opts.unregister
 * @returns {{ ok: boolean, current: string|null, error?: 'invalid'|'unavailable' }}
 */
export function swapShortcut({ current, next, register, unregister }) {
  if (!isValidAccelerator(next)) return { ok: false, error: 'invalid', current }
  if (next === current) return { ok: true, current }
  let taken
  try {
    taken = register(next)
  } catch {
    taken = false
  }
  if (!taken) return { ok: false, error: 'unavailable', current }
  if (current) unregister(current)
  return { ok: true, current: next }
}
