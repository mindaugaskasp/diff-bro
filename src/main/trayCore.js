// The tray's decisions with no Electron in them, so they unit-test — the same
// split sealing.js/share.js uses. Windows only: a desktop whose tray support is
// uneven (GNOME without an extension) would strand the window, not store it.

/** @param {NodeJS.Platform|string} platform */
export const hasTray = (platform) => platform === 'win32'

/**
 * Whether the window's close button should hide the window rather than destroy
 * it. `quitting` is the escape hatch every path out of the app sets first —
 * without it Exit would hide the window and leave the process running, which is
 * the classic close-to-tray bug.
 *
 * @param {{ platform: NodeJS.Platform|string, closeToTray: boolean, quitting: boolean }} spec
 * @returns {boolean}
 */
export function shouldHideOnClose({ platform, closeToTray, quitting }) {
  if (!hasTray(platform) || quitting) return false
  return closeToTray !== false
}

/**
 * Whether a launch should come up with no window on screen — the login item
 * passes this so signing in does not throw a window at you.
 * @param {string[]} argv
 * @returns {boolean}
 */
export const startsHidden = (argv) => (argv ?? []).includes('--hidden')

/**
 * The tray menu, as ids and catalogue keys. Labels are resolved by the caller:
 * a table of translated strings built once would freeze the language the app
 * started in, which is the trap docs/standards.md records for `utils/`.
 * @returns {Array<{ id: string, labelKey: string }>}
 */
export const trayMenuRows = () => [
  { id: 'open', labelKey: 'tray.open' },
  { id: 'quickLook', labelKey: 'tray.quickLook' },
  { id: 'separator', labelKey: null },
  { id: 'exit', labelKey: 'tray.exit' }
]

/**
 * What setLoginItemSettings should be told. `--hidden` rides along so a login
 * launch goes straight to the tray; the executable is NEVER part of this — main
 * passes its own process.execPath, and nothing the renderer says can change it.
 * @param {boolean} openAtLogin
 */
export const loginItemSettings = (openAtLogin) => ({
  openAtLogin: openAtLogin === true,
  args: ['--hidden']
})
