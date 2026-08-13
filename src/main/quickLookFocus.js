import { ipcMain } from 'electron'

// Focus policy around the launcher, kept out of the window glue (quickLook.js)
// so both halves unit-test with plain objects: what silences the global
// shortcut, and the macOS dance that stops a dismissal dragging the main window
// to the front.

// The one thing the global shortcut must not interrupt: the Settings capture
// field, where the chord being typed IS the input. Everywhere else it summons —
// including with Diff Bro itself in front, which is where a launcher is most
// often wanted and where it used to do nothing at all.
let capturing = false

/** @returns {boolean} whether Settings is waiting for a chord right now */
export const isCapturingShortcut = () => capturing

export function registerQuickLookFocusIpc() {
  // Boolean only: this flips an existing, user-triggered behaviour on and off.
  // It names no window, no path and no key.
  ipcMain.on('quicklook:capturing-shortcut', (e, value) => {
    capturing = value === true
    // MAIN owns the lifetime, not the window that armed it: a renderer closed or
    // reloaded mid-capture never sends the false, and the chord would stay dead
    // for the rest of the session with no window left to explain why.
    if (capturing) e.sender.once('destroyed', () => (capturing = false))
  })
}

// On macOS, hiding the launcher while Diff Bro is active raises the app's next
// window (the main window) to the front. app.hide() would prevent that but hides
// the main window too, which the next summon then drags back up. So instead make
// the main window briefly non-focusable: the OS can't make it key, the app
// deactivates back to the previous app, and the main window stays put.
const REFOCUS_MS = 300
let refocusTimer = null

// The un-focusable window above is a timed state, so anything that wants to
// focus the main window must end it first — otherwise focus() is a silent no-op
// and the window surfaces without keyboard focus.
export function allowMainFocus(main) {
  if (refocusTimer) {
    clearTimeout(refocusTimer)
    refocusTimer = null
  }
  if (main && !main.isDestroyed()) main.setFocusable(true)
}

/**
 * Hide the launcher without handing the front to the main window.
 * @param {object} o
 * @param {{hide: () => void}|null} o.launcher
 * @param {object|null} o.main
 * @param {string} o.platform
 */
export function hideLauncher({ launcher, main, platform }) {
  const parks = platform === 'darwin' && !!main && main.isVisible() && !main.isMinimized()
  if (parks) main.setFocusable(false)
  launcher?.hide()
  if (!parks) return
  if (refocusTimer) clearTimeout(refocusTimer)
  refocusTimer = setTimeout(() => {
    refocusTimer = null
    if (!main.isDestroyed()) main.setFocusable(true)
  }, REFOCUS_MS)
}
