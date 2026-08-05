// Platform-aware shortcut labels. Electron menu accelerators already use
// CmdOrCtrl (so the real bindings are correct everywhere); this is for the
// labels shown in our own UI.
export const isMac = navigator.platform.toUpperCase().includes('MAC')
export const isWindows = navigator.platform.toUpperCase().includes('WIN')
export const MOD = isMac ? 'Cmd' : 'Ctrl'

// In main's vocabulary, so the two processes can share a platform-keyed table
// (src/shared/shortcuts.js) instead of each inventing its own.
export const platformId = (() => {
  if (isMac) return 'darwin'
  return isWindows ? 'win32' : 'linux'
})()
