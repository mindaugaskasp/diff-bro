// The floating quick look-up window: the Electron glue (window, shortcut, IPC)
// over the pure quickLookCore.js.
//
// SECURITY: the offline guarantee holds for EVERY window. The network kill
// switch and the deny-all permission handler are session-level (security.js) and
// already cover this window; the per-window guards below (hardened
// webPreferences, window-open deny, will-navigate block) are re-declared here
// exactly as window.js does — never trust a default to carry them.
import { BrowserWindow, app, globalShortcut, ipcMain, screen } from 'electron'
import { join } from 'path'
import { DEV_URL } from './env'
import { readSettings } from './appData'
import { appendLog } from './logger'
import {
  placeWindow,
  displayForPoint,
  resolveAccelerator,
  launcherDiagnostics
} from './quickLookCore'

// Fallback when settings.json has none. Mirror the renderer's
// DEFAULT_QUICKLOOK_SHORTCUT (settingsStore.js) — keep the two in step.
const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+Space'

let win = null
// The accelerator currently registered, so a change unregisters exactly it.
let currentAccelerator = null

function build() {
  const w = new BrowserWindow({
    width: 720,
    height: 480,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false
    }
  })

  // Cloned from window.js: never open external links or navigate away.
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault()
  })

  // Spotlight-like: hide on click-away. Kept warm (hidden, never destroyed).
  w.on('blur', () => w.hide())

  if (DEV_URL) {
    w.loadURL(`${DEV_URL}/quicklook.html`)
  } else {
    w.loadFile(join(__dirname, '../renderer/quicklook.html'))
  }
  return w
}

function ensure() {
  if (!win || win.isDestroyed()) win = build()
  return win
}

function mainWindow() {
  return BrowserWindow.getAllWindows().find((w) => w !== win)
}

// Diagnostics only (source 'quicklook', not an error): captures the display/window
// layout at each summon/dismiss so an intermittent "main window rises with the
// overlay" report can be correlated against a real multi-display state.
function logDiag(event, displays, cursor, launcher) {
  const m = mainWindow()
  const main = m
    ? {
        visible: m.isVisible(),
        minimized: m.isMinimized(),
        focused: m.isFocused(),
        bounds: m.getBounds()
      }
    : null
  appendLog({
    source: 'quicklook',
    message: `launcher ${event}`,
    context: launcherDiagnostics({ event, displays, cursor, main, launcher })
  })
}

// Repositioned every summon onto the display holding the pointer.
function reveal() {
  const w = ensure()
  const point = screen.getCursorScreenPoint()
  const displays = screen.getAllDisplays()
  const display = displayForPoint(displays, point) ?? screen.getPrimaryDisplay()
  const { x, y } = placeWindow(display.workArea, w.getBounds())
  logDiag('reveal', displays, point, {
    x,
    y,
    width: w.getBounds().width,
    height: w.getBounds().height
  })
  w.setPosition(x, y)
  // Separate Pinia instance — the renderer re-reads its library and refocuses.
  w.webContents.send('quicklook:show')
  w.show()
  w.focus()
}

// On macOS, hiding the launcher while DiffBro is active raises the app's next
// window (the main window) to the front. app.hide() would prevent that but hides
// the main window too, which the next summon then drags back up. So instead make
// the main window briefly non-focusable: the OS can't make it key, the app
// deactivates back to the previous app, and the main window stays put.
function hideLauncher() {
  logDiag('hide', screen.getAllDisplays(), screen.getCursorScreenPoint(), win?.getBounds())
  if (process.platform !== 'darwin') {
    win?.hide()
    return
  }
  const main = mainWindow()
  if (main && main.isVisible() && !main.isMinimized()) {
    main.setFocusable(false)
    win?.hide()
    setTimeout(() => main.setFocusable(true), 300)
  } else {
    win?.hide()
  }
}

export function toggleQuickLook() {
  const w = ensure()
  if (w.isVisible()) hideLauncher()
  else reveal()
}

// Global-shortcut entry point only (menu/IPC toggle unconditionally): skip
// revealing when you're already in the app, e.g. capturing a new shortcut in
// Settings — the keypress would otherwise pop the launcher over the field.
function onShortcut() {
  const w = ensure()
  const main = BrowserWindow.getAllWindows().find((x) => x !== w)
  if (!w.isVisible() && main?.isFocused()) return
  toggleQuickLook()
}

// Hand a chosen result to the main window on its own channel (menu:action stays
// a plain-string channel, so the id travels separately).
function openInMain(payload) {
  win?.hide()
  const main = BrowserWindow.getAllWindows().find((w) => w !== win)
  if (!main) return
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
  main.webContents.send('quicklook:openInMain', payload)
}

// Releases the previous binding first. 'invalid' = Electron rejected the string;
// 'unavailable' = another app already holds the combo.
function registerShortcut(accel) {
  if (currentAccelerator) {
    globalShortcut.unregister(currentAccelerator)
    currentAccelerator = null
  }
  try {
    if (globalShortcut.register(accel, onShortcut)) {
      currentAccelerator = accel
      return { ok: true }
    }
    return { ok: false, error: 'unavailable' }
  } catch {
    return { ok: false, error: 'invalid' }
  }
}

export function registerQuickLook() {
  const res = registerShortcut(
    resolveAccelerator(readSettings().quickLookShortcut, DEFAULT_ACCELERATOR)
  )
  if (!res.ok) registerShortcut(DEFAULT_ACCELERATOR)
  ipcMain.handle('quicklook:toggle', () => toggleQuickLook())
  ipcMain.handle('quicklook:setShortcut', (_e, accel) => registerShortcut(accel))
  ipcMain.handle('quicklook:hide', () => hideLauncher())
  ipcMain.handle('quicklook:open', (_e, payload) => openInMain(payload))
  // Process-wide OS registrations — release on quit.
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

// Called from index.js on the main window's 'closed': a lingering hidden launcher
// would keep a window alive and block window-all-closed (Windows/Linux).
export function destroyQuickLook() {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
}
