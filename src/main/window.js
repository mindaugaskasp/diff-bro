import { BrowserWindow, Menu, app, screen } from 'electron'
import { writeFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DEV_URL } from './env'
import appIcon from '../../resources/icon.png?asset'

// --- Window state persistence (size/position across launches) ---

const windowStatePath = () => join(app.getPath('userData'), 'window-state.json')

function loadWindowState() {
  try {
    const s = JSON.parse(readFileSync(windowStatePath(), 'utf-8'))
    if (![s.width, s.height, s.x, s.y].every(Number.isFinite)) return {}
    // Only restore a position that is still on a connected display.
    const visible = screen
      .getAllDisplays()
      .some(
        ({ workArea: a }) =>
          s.x >= a.x - 8 && s.y >= a.y - 8 && s.x < a.x + a.width && s.y < a.y + a.height
      )
    return visible ? s : { width: s.width, height: s.height }
  } catch {
    return {}
  }
}

function trackWindowState(win) {
  let timer = null
  const save = () => {
    const bounds = win.getNormalBounds()
    writeFile(windowStatePath(), JSON.stringify({ ...bounds, maximized: win.isMaximized() })).catch(
      () => {}
    )
  }
  const debounced = () => {
    clearTimeout(timer)
    timer = setTimeout(save, 500)
  }
  win.on('resize', debounced)
  win.on('move', debounced)
  win.on('close', save)
}

// The TOOLBAR sets the width floor, not the panes — below it the whole document
// scrolled sideways. e2e/toolbar-width.spec.mjs asserts against
// getMinimumSize(), so the number and the layout cannot drift apart.
const MIN_WIDTH = 1120
const MIN_HEIGHT = 640

/**
 * @param {{ show?: boolean }} [opts] `show: false` is the login-item launch —
 *   the window is built so the shortcut and the CLI have something to raise, but
 *   signing in does not throw it on screen.
 */
export function createWindow({ show = true } = {}) {
  const state = loadWindowState()
  const win = new BrowserWindow({
    show,
    width: state.width ?? 1400,
    height: state.height ?? 900,
    x: state.x,
    y: state.y,
    resizable: true,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: '#0d1117',
    ...(process.platform !== 'darwin' ? { icon: appIcon } : {}),
    // Windows/Linux draw their own themed menu bar (MenuBar.vue); macOS keeps
    // the native one.
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Off in a packaged build: no console into the renderer.
      devTools: !app.isPackaged,
      // Chromium's spellchecker downloads dictionaries — keep off (offline).
      spellcheck: false
    }
  })

  // Never open external links or navigate away — allow only the dev server's
  // HMR full-reloads.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault()
  })

  // Native right-click Cut/Copy/Paste via menu roles, so the clipboard works on
  // every platform regardless of the app menu.
  win.webContents.on('context-menu', (_e, params) => {
    const { editFlags, isEditable, selectionText } = params
    const items = []
    if (isEditable) {
      items.push(
        { role: 'cut', enabled: editFlags.canCut },
        { role: 'copy', enabled: editFlags.canCopy },
        { role: 'paste', enabled: editFlags.canPaste }
      )
    } else if (selectionText?.trim()) {
      items.push({ role: 'copy', enabled: editFlags.canCopy })
    }
    if (!items.length) return
    items.push({ type: 'separator' }, { role: 'selectAll' })
    Menu.buildFromTemplate(items).popup({ window: win })
  })

  // autoHideMenuBar still reveals the bar on Alt; the menu stays installed so
  // its accelerators keep working.
  if (process.platform !== 'darwin') win.setMenuBarVisibility(false)

  if (state.maximized && show) win.maximize()
  trackWindowState(win)

  // No renderer-observable signal exists for OS-level fullscreen, so push it (the
  // Mermaid viewer fills the window in step).
  const sendFullScreen = () => win.webContents.send('window:fullscreen', win.isFullScreen())
  win.on('enter-full-screen', sendFullScreen)
  win.on('leave-full-screen', sendFullScreen)

  if (DEV_URL) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
