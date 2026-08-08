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
import { cliUsage, helpText, parseCli } from './cli'
import { handoffLine, promptSnippet } from './cliPrompt'
import { discardDraftFile, readDraftFile, sweepDraftFiles, writeDraftFile } from './cliDraft'
import { loadLocale, t } from './i18n'

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
  process.stderr.write(`${cold.error}\n\n${cliUsage()}\n`)
  app.exit(1)
}

// `new snippet` is asked for HERE, in the CLI process, before the lock decides
// whether we are the app or a messenger for one already running. The prompt is
// async, so the whole launch is sequenced behind it — nothing else may run
// while the reader is being asked anything.
async function askForDraft() {
  if (cold.command?.name !== 'new-snippet') return null
  cold.command.draft = await promptSnippet(cold.command.flags)
  if (!cold.command.draft) {
    process.stderr.write(`${t('cliPrompt.nothingToSave')}\n`)
    app.exit(1)
    return null
  }
  // Via a FILE, never the single-instance payload: Chromium's POSIX singleton
  // mis-sizes that buffer, and a body with whitespace and any character above
  // U+00FF killed the app it was handed to. Only the path travels.
  const path = writeDraftFile(cold.command.draft)
  // The confirmation is the OUTPUT, so it is the one thing on stdout.
  process.stdout.write(`${handoffLine(cold.command.draft)}\n`)
  return path
}

// Single instance. When a newer build is launched over a running one (no
// auto-updater by design), the loser's version differs, so the running instance
// relaunches from its now-replaced path to pick up the update rather than
// leaving the stale UI on screen.
async function boot() {
  const draftPath = await askForDraft()
  if (!app.requestSingleInstanceLock({ version: app.getVersion(), draftPath })) {
    app.quit()
    return
  }
  // A `diffbro …` launch is a second instance: the lock hands us its argv and
  // cwd, so the command runs here rather than starting a second app.
  app.on('second-instance', (_event, argv, cwd, additionalData) => {
    if (additionalData?.version && additionalData.version !== app.getVersion()) {
      app.relaunch()
      app.exit(0)
      return
    }
    ensureMainWindow()
    // The draft was typed in the OTHER process and cannot be re-parsed out of a
    // command line it was never on, so it arrives as a file beside argv.
    const draft = readDraftFile(additionalData?.draftPath)
    routeCliArgv(argv, cwd, draft ? { name: 'new-snippet', draft } : null)
  })

  app.whenReady().then(() => startApp(draftPath))
}

function startApp(draftPath) {
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
  // We WON the lock, so the draft never left this process — the file written
  // for the losing case is ours to remove. The sweep is for crash leftovers,
  // and only takes what is old enough not to belong to a live CLI.
  discardDraftFile(draftPath)
  sweepDraftFiles()
  routeCliArgv(process.argv, process.cwd(), cold.command)
  app.on('activate', ensureMainWindow)
}

boot()

// Every route out of the app passes through here first, so the close handler
// knows this one is a real quit and lets the window go (see trayCore).
app.on('before-quit', markQuitting)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
