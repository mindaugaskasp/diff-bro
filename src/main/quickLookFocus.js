import { ipcMain } from 'electron'

// The global shortcut deliberately does nothing while Diff Bro itself is
// focused: capturing a new binding in Settings would otherwise pop the launcher
// over the field being typed into. The onboarding tour asks the user to press
// the chord WHILE the app is in front, so it lifts the guard for that one step
// and puts it straight back.
let allowed = false

/** @returns {boolean} whether a focused main window should still summon it */
export const allowsWhileFocused = () => allowed

export function registerQuickLookFocusIpc() {
  // Boolean only: this flips an existing, user-triggered behaviour on and off.
  // It names no window, no path and no key.
  ipcMain.on('quicklook:allow-while-focused', (_e, value) => {
    allowed = value === true
  })
}
