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
import { registerQuickLook, destroyQuickLook } from './quickLook'
import { registerLinkIpc } from './links'
import { installCrashHooks, registerLoggerIpc } from './logger'

applyHeadlessSwitches() // must precede app ready, while the command line is mutable
installCrashHooks()

// Single instance. When a newer build is launched over a running one (no
// auto-updater by design), the loser's version differs, so the running instance
// relaunches from its now-replaced path to pick up the update rather than
// leaving the stale UI on screen.
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
    registerLoggerIpc()
    registerLinkIpc()
    const mainWin = createWindow()
    registerQuickLook()
    // Without this, the hidden launcher keeps a window alive and blocks quit.
    mainWin.on('closed', destroyQuickLook)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
