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
import { allowsWhileFocused } from './quickLookFocus'
import {
  placeWindow,
  displayForPoint,
  resolveAccelerator,
  launcherDiagnostics,
  launcherSpaceBehavior,
  needsMainWindow,
  swapShortcut
} from './quickLookCore'

// Fallback when settings.json has none. Mirror the renderer's
// DEFAULT_QUICKLOOK_SHORTCUT (settingsStore.js) — keep the two in step.
const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+Space'

let win = null
// The accelerator currently registered, so a change unregisters exactly it.
let currentAccelerator = null
// Injected by registerQuickLook, so this module never owns the main window.
let createMain = null

function build() {
  const w = new BrowserWindow({
    // The card is flat and fills the window, so these are its exact dimensions.
    width: 692,
    height: 452,
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

  const space = launcherSpaceBehavior(process.platform)
  if (space) {
    w.setAlwaysOnTop(true, space.level)
    w.setVisibleOnAllWorkspaces(space.visibleOnAllWorkspaces, {
      visibleOnFullScreen: space.visibleOnFullScreen
    })
  }

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
  return BrowserWindow.getAllWindows().find((w) => w !== win) ?? null
}

/**
 * Whether a window is the launcher. It holds no document and never wires
 * onMenuAction, so a menu action routed to it is simply dropped.
 * @param {import('electron').BrowserWindow|null} candidate
 */
export const isLauncher = (candidate) => !!candidate && candidate === win

// Also ends the un-focusable state hideLauncher leaves behind, without which
// focus() below is a silent no-op.
export function ensureMainWindow() {
  allowMainFocus()
  const main = needsMainWindow(BrowserWindow.getAllWindows(), win) ? createMain?.() : mainWindow()
  if (!main) return null
  if (main.isMinimized()) main.restore()
  main.show()
  // macOS: focus() raises a window inside the app but does not activate the app
  // or switch to the Space the window lives on, so a Dock click or a second
  // launch from elsewhere looks like nothing happened.
  if (process.platform === 'darwin') app.focus({ steal: true })
  main.focus()
  return main
}

// Diagnostics only (source 'quicklook', not an error): captures the display/window
// layout at each summon/dismiss so an intermittent "main window rises with the
// overlay" report can be correlated against a real multi-display state.
function logDiag(event, displays, cursor, launcher) {
  const m = mainWindow()
  const main = m && {
    visible: m.isVisible(),
    minimized: m.isMinimized(),
    focused: m.isFocused(),
    bounds: m.getBounds()
  }
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
// The un-focusable window above is a timed state, so anything that wants to
// focus the main window must end it first — otherwise focus() is a silent no-op
// and the window surfaces without keyboard focus.
let refocusTimer = null
export function allowMainFocus() {
  if (refocusTimer) {
    clearTimeout(refocusTimer)
    refocusTimer = null
  }
  const main = mainWindow()
  if (main && !main.isDestroyed()) main.setFocusable(true)
}

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
    if (refocusTimer) clearTimeout(refocusTimer)
    refocusTimer = setTimeout(() => {
      refocusTimer = null
      if (!main.isDestroyed()) main.setFocusable(true)
    }, 300)
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
  if (!w.isVisible() && main?.isFocused() && !allowsWhileFocused()) return
  toggleQuickLook()
}

// Hand a chosen result to the main window on its own channel (menu:action stays
// a plain-string channel, so the id travels separately).
function openInMain(payload) {
  win?.hide()
  const main = ensureMainWindow()
  if (!main) return
  const send = () => main.webContents.send('quicklook:openInMain', payload)
  // A window we just created has no listener yet, so the payload would be lost.
  if (main.webContents.isLoading()) main.webContents.once('did-finish-load', send)
  else send()
}

// 'invalid' = the string is not a registerable binding; 'unavailable' = another
// app already holds the combo. On either, the working shortcut is left alone.
function registerShortcut(accel) {
  const res = swapShortcut({
    current: currentAccelerator,
    next: accel,
    register: (a) => globalShortcut.register(a, onShortcut),
    unregister: (a) => globalShortcut.unregister(a)
  })
  currentAccelerator = res.current
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

export function registerQuickLook(openMainWindow) {
  createMain = openMainWindow
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
