// Entry point: process lifecycle and wiring only. Everything with substance
// lives in a module beside this one (CLAUDE.md — index.js is thin glue):
//   security.js  offline kill switch, permission handler, headless switches
//   window.js    BrowserWindow creation + window-state persistence
//   menu.js      application menu and its two escape-hatch IPC handlers
//   vault.js     saved-diff vault key + vault:encrypt/decrypt
//   files.js     file dialogs and reads
//   textTools.js Tools-menu passphrase crypto
//   share.js / snippets.js  sealed share + snippet export IPC
import { app, BrowserWindow } from 'electron'
import { applyHeadlessSwitches, installNetworkKillSwitch } from './security'
import { createWindow } from './window'
import { registerAppDataIpc } from './appData'
import { installMenu, registerMenuIpc } from './menu'
import { registerVaultIpc } from './vault'
import { registerClipboardIpc } from './clipboard'
import { registerFileIpc } from './files'
import { registerTextToolsIpc } from './textTools'
import { registerShareIpc } from './share'
import { registerSnippetIpc } from './snippets'

// Must run before app ready, while the command line is still mutable.
applyHeadlessSwitches()

// Only one instance/window. A second launch hands its args (and its version)
// off to the running instance and quits instead of opening a second window.
//
// The version is how an update takes effect: with no auto-updater (offline by
// design), a user installs a new build and launches it while the old one is
// still running. That new launch loses the single-instance race and quits —
// which, without the check below, would leave the STALE old UI on screen. So
// when the incoming version differs from ours, the running instance relaunches
// from its own path (which the installer has just replaced) to load the new
// build, giving the user the updated app instead of the old one.
if (!app.requestSingleInstanceLock({ version: app.getVersion() })) {
  app.quit()
} else {
  app.on('second-instance', (_event, _argv, _cwd, additionalData) => {
    if (additionalData?.version && additionalData.version !== app.getVersion()) {
      app.relaunch()
      app.exit(0)
      return
    }
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    installNetworkKillSwitch()
    registerAppDataIpc()
    installMenu()
    registerMenuIpc()
    registerVaultIpc()
    registerClipboardIpc()
    registerFileIpc()
    registerTextToolsIpc()
    registerShareIpc()
    registerSnippetIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
