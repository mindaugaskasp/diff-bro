import { app } from 'electron'
import { applyHeadlessSwitches, installNetworkKillSwitch } from './security'
import { createWindow } from './window'
import { registerAppDataIpc } from './appData'
import { installMenu, registerMenuIpc } from './menu'
import { registerVaultIpc } from './vault'
import { registerClipboardIpc } from './clipboard'
import { registerFileIpc } from './files'
import { registerDiffImageIpc } from './diffImage'
import { registerTextToolsIpc } from './textTools'
import { registerShareIpc } from './share'
import { registerSnippetIpc } from './snippets'
import { ensureMainWindow, registerQuickLook, destroyQuickLook } from './quickLook'
import { registerLinkIpc } from './links'
import { installCrashHooks, registerLoggerIpc } from './logger'
import { registerCliIpc, routeCliArgv } from './cliRoute'

applyHeadlessSwitches() // must precede app ready, while the command line is mutable
installCrashHooks()

// Single instance. When a newer build is launched over a running one (no
// auto-updater by design), the loser's version differs, so the running instance
// relaunches from its now-replaced path to pick up the update rather than
// leaving the stale UI on screen.
if (!app.requestSingleInstanceLock({ version: app.getVersion() })) {
  app.quit()
} else {
  // A `diffbro …` launch is a second instance: the lock hands us its argv and
  // cwd, so the command runs here rather than starting a second app.
  app.on('second-instance', (_event, argv, cwd, additionalData) => {
    if (additionalData?.version && additionalData.version !== app.getVersion()) {
      app.relaunch()
      app.exit(0)
      return
    }
    ensureMainWindow()
    routeCliArgv(argv, cwd)
  })

  app.whenReady().then(() => {
    installNetworkKillSwitch()
    registerAppDataIpc()
    installMenu()
    registerMenuIpc()
    registerVaultIpc()
    registerClipboardIpc()
    registerFileIpc()
    registerDiffImageIpc()
    registerTextToolsIpc()
    registerShareIpc()
    registerSnippetIpc()
    registerLoggerIpc()
    registerLinkIpc()
    registerCliIpc()
    // Every main window, not just the first: without this the hidden launcher
    // keeps a window alive and blocks quit.
    const openMainWindow = () => {
      const w = createWindow()
      w.on('closed', destroyQuickLook)
      return w
    }
    openMainWindow()
    registerQuickLook(openMainWindow)
    // A cold `diffbro …`: this process IS the launch, so its own argv carries
    // the command. It waits for the renderer to announce itself.
    routeCliArgv(process.argv, process.cwd())
    app.on('activate', ensureMainWindow)
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
