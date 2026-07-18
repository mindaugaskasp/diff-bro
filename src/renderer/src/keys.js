// Platform-aware shortcut labels. Electron menu accelerators already use
// CmdOrCtrl (so the real bindings are correct everywhere); this is for the
// labels shown in our own UI.
export const isMac = navigator.platform.toUpperCase().includes('MAC')
export const MOD = isMac ? 'Cmd' : 'Ctrl'
