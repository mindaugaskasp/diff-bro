import { BrowserWindow, ipcMain } from 'electron'

// Full screen for presentation mode. Only main may ask Electron (rule 3), so the
// renderer states an intent and gets the resulting state back.
//
// A boolean SETS, no argument READS — the renderer needs the read to remember
// what Escape restores to. Distinct from `window:fullscreen`, which window.js
// PUSHES on enter/leave: that one reports, this one asks.

export function registerPresentationIpc() {
  ipcMain.handle('window:fullscreen-state', (event, flag) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (typeof flag === 'boolean' && flag !== win.isFullScreen()) win.setFullScreen(flag)
    return win.isFullScreen()
  })
}
