// The floating quick look-up window: a frameless, always-on-top launcher summoned
// by a GLOBAL shortcut even while the main window is minimized, so a snippet or
// saved diff can be found without bringing the whole app forward. This file is
// the Electron glue (window, shortcut, IPC); the placement math it leans on is
// the pure quickLookCore.js so it stays unit-testable (CLAUDE.md: keep logic out
// of Electron-importing files).
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
import { placeWindow, displayForPoint, resolveAccelerator } from './quickLookCore'

// Fallback summon accelerator when settings.json has none. Per-platform to match
// the renderer's DEFAULT_QUICKLOOK_SHORTCUT (settingsStore.js): macOS defaults to
// Shift+Space, Windows/Linux to the safe three-key chord (Cmd+Space is macOS
// Spotlight). Keep the two in step.
const DEFAULT_ACCELERATOR =
  process.platform === 'darwin' ? 'Shift+Space' : 'CommandOrControl+Shift+Space'

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

  // A launcher that lingers after you click away isn't a launcher: hide on blur
  // so it behaves like Spotlight. It is kept warm (hidden, never destroyed) so
  // the next summon is instant.
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

// Place on the display holding the pointer, then reveal and focus — repositioned
// every time so the launcher follows the user across monitors.
function reveal() {
  const w = ensure()
  const point = screen.getCursorScreenPoint()
  const display = displayForPoint(screen.getAllDisplays(), point) ?? screen.getPrimaryDisplay()
  const { x, y } = placeWindow(display.workArea, w.getBounds())
  w.setPosition(x, y)
  // Tell the renderer to re-read its (separately-persisted) library and focus
  // the input — the two windows are separate Pinia instances, so this window's
  // list is refreshed from disk on each summon.
  w.webContents.send('quicklook:show')
  w.show()
  w.focus()
}

// Dismiss the launcher (Esc, copy-and-go, toggle-off). On macOS, hiding the
// launcher while DiffBro is the active app makes the OS raise the app's NEXT
// window — the main window — to the front, even when it was sitting behind other
// apps (the reported "main window gets focused after copy" bug).
//
// The fix must NOT hide the main window: app.hide() would, and then the next
// summon (win.show → app un-hides) drags every window back up. Instead, make the
// main window briefly NON-FOCUSABLE so the OS can't make it key when the launcher
// hides — the app deactivates and focus returns to the previous app, while the
// main window stays exactly where it was. Focusability is restored right after,
// so the user can click back into it normally.
function hideLauncher() {
  if (process.platform !== 'darwin') {
    win?.hide()
    return
  }
  const main = BrowserWindow.getAllWindows().find((w) => w !== win)
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

// Hand a chosen result to the MAIN window: the big view does the heavy lifting
// (load + restore a diff, or open the snippet editor). We hide the launcher,
// surface the main window, and forward the pick on its own channel — menu:action
// stays a plain-string channel, so this carries the id separately.
function openInMain(payload) {
  win?.hide()
  const main = BrowserWindow.getAllWindows().find((w) => w !== win)
  if (!main) return
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
  main.webContents.send('quicklook:openInMain', payload)
}

// (Re-)register the global summon shortcut, releasing the previous binding
// first. Returns { ok } or { ok:false, error } so the renderer can warn: a
// structurally-bad accelerator throws ('invalid'); one already claimed by
// another app makes register() return false ('unavailable').
function registerShortcut(accel) {
  if (currentAccelerator) {
    globalShortcut.unregister(currentAccelerator)
    currentAccelerator = null
  }
  try {
    if (globalShortcut.register(accel, toggleQuickLook)) {
      currentAccelerator = accel
      return { ok: true }
    }
    return { ok: false, error: 'unavailable' }
  } catch {
    return { ok: false, error: 'invalid' }
  }
}

export function registerQuickLook() {
  const res = registerShortcut(resolveAccelerator(readSettings().quickLookShortcut, DEFAULT_ACCELERATOR))
  // A stored accelerator that's invalid or taken: fall back to the default so
  // the feature always has a working binding.
  if (!res.ok) registerShortcut(DEFAULT_ACCELERATOR)
  // The custom in-app menu bar (Windows/Linux) can't call toggleQuickLook
  // itself; the app menu (macOS) invokes it directly.
  ipcMain.handle('quicklook:toggle', () => toggleQuickLook())
  // Settings → Shortcuts applies a new binding live.
  ipcMain.handle('quicklook:setShortcut', (_e, accel) => registerShortcut(accel))
  ipcMain.handle('quicklook:hide', () => hideLauncher())
  ipcMain.handle('quicklook:open', (_e, payload) => openInMain(payload))
  // Global shortcuts are process-wide OS registrations — release them on quit.
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

// Closing the main window (Windows/Linux) must let the app quit: a lingering
// hidden launcher would otherwise keep a window alive and block
// window-all-closed. Called from index.js on the main window's 'closed'.
export function destroyQuickLook() {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
}
