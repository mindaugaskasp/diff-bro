import { app } from 'electron'
import { applyHeadlessSwitches, installNetworkKillSwitch } from './security'
import { createWindow } from './window'
import { registerAppDataIpc } from './appData'
import { registerDemoIpc } from './demoFiles'
import { registerQuickLookFocusIpc } from './quickLookFocus'
import { installMenu, registerMenuIpc } from './menu'
import { registerVaultIpc } from './vault'
import { registerClipboardIpc } from './clipboard'
import { registerFileIpc } from './files'
import { registerStreamedDiffIpc } from './streamedDiff'
import { registerDiffImageIpc } from './diffImage'
import { registerTextToolsIpc } from './textTools'
import { registerHashIpc } from './hashTools'
import { backupIfDue, registerBackupIpc } from './backupRoute'
import { readSettings, setBackupHook } from './appData'
import { registerShareIpc } from './share'
import { registerMailIpc } from './mail'
import { registerClipboardCopyIpc } from './clipboardCopy'
import { registerSnippetIpc } from './snippets'
import { ensureMainWindow, registerQuickLook, destroyQuickLook, toggleQuickLook } from './quickLook'
import { attachCloseToTray, installTray, markQuitting, registerTrayIpc } from './tray'
import { startsHidden } from './trayCore'
import { registerLinkIpc } from './links'
import { installCrashHooks, registerLoggerIpc } from './logger'
import { registerCliIpc, routeCliArgv } from './cliRoute'
import { CLI_USAGE, helpText, parseCli } from './cli'
import { loadLocale } from './i18n'

applyHeadlessSwitches() // must precede app ready, while the command line is mutable
installCrashHooks()

// `diffbro help` and a malformed command answer in the TERMINAL: they print and
// exit before any window is made and before the single-instance lock is touched,
// so asking what a command does never raises the app over what you were doing.
const cold = parseCli(process.argv)
if (cold.command?.name === 'help') {
  const { text, ok } = helpText(cold.command.topic)
  process.stdout.write(`${text}\n`)
  app.exit(ok ? 0 : 1)
} else if (cold.error) {
  process.stderr.write(`${cold.error}\n\n${CLI_USAGE}\n`)
  app.exit(1)
}

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
    registerDemoIpc()
    registerQuickLookFocusIpc()
    loadLocale(readSettings().locale) // before installMenu: it builds from this
    installMenu()
    registerMenuIpc()
    registerVaultIpc()
    registerClipboardIpc()
    registerFileIpc()
    registerStreamedDiffIpc()
    registerDiffImageIpc()
    registerTextToolsIpc()
    registerHashIpc()
    registerBackupIpc()
    setBackupHook(backupIfDue)
    registerShareIpc()
    registerMailIpc()
    registerClipboardCopyIpc()
    registerSnippetIpc()
    registerLoggerIpc()
    registerLinkIpc()
    registerCliIpc()
    registerTrayIpc()
    // Every main window, not just the first: without this the hidden launcher
    // keeps a window alive and blocks quit.
    const openMainWindow = (opts) => {
      const w = createWindow(opts)
      attachCloseToTray(w)
      w.on('closed', destroyQuickLook)
      return w
    }
    // A login-item launch (`--hidden`) comes up in the tray: signing in should
    // not throw a window at you. It is still BUILT, so the shortcut and the CLI
    // have something to raise.
    openMainWindow({ show: !startsHidden(process.argv) })
    // After registerQuickLook, which is what hands ensureMainWindow the way to
    // build one — the tray's Open would otherwise have nothing to call in the
    // moment between.
    registerQuickLook(openMainWindow)
    installTray({ openMainWindow: () => ensureMainWindow(), toggleQuickLook })
    // A cold `diffbro …`: this process IS the launch, so its own argv carries
    // the command. It waits for the renderer to announce itself.
    routeCliArgv(process.argv, process.cwd())
    app.on('activate', ensureMainWindow)
  })
}

// Every route out of the app passes through here first, so the close handler
// knows this one is a real quit and lets the window go (see trayCore).
app.on('before-quit', markQuitting)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
