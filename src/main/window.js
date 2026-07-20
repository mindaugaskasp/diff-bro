import { BrowserWindow, app, screen } from 'electron'
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

export function createWindow() {
  const state = loadWindowState()
  const win = new BrowserWindow({
    width: state.width ?? 1400,
    height: state.height ?? 900,
    x: state.x,
    y: state.y,
    resizable: true,
    // Floor chosen so the core layout stays usable: the sidebar cannot go
    // below SIDEBAR_MIN (180px, App.vue) and split view still leaves both
    // Monaco panes wide enough to read a line of code. Also keeps the window
    // openable on a 1024x768 display.
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#0d1117',
    // macOS gets its icon from the app bundle; win/linux take it here.
    ...(process.platform !== 'darwin' ? { icon: appIcon } : {}),
    // On Windows/Linux the renderer draws its own themed menu bar
    // (MenuBar.vue); the native one stays hidden. macOS keeps the native
    // system menu bar, which is the platform-correct look.
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Sandboxed renderer: the preload only uses the electron built-ins
      // that sandboxed preloads are allowed (ipcRenderer, contextBridge,
      // webFrame, webUtils), so full Node access is unnecessary.
      sandbox: true,
      // No DevTools in a packaged build — this disables them at the source
      // (any accelerator, the Inspect context item, and openDevTools all
      // become no-ops), not just the menu entry, so a production build
      // exposes no console into the renderer.
      devTools: !app.isPackaged,
      // Chromium's spellchecker downloads dictionaries from Google - keep off.
      spellcheck: false
    }
  })

  // Never open external links or navigate away from the app. will-navigate
  // only fires for renderer-initiated navigations (loadFile/loadURL bypass
  // it), and the app never navigates itself — so block everything except
  // the dev server's HMR full-reloads.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault()
  })

  // autoHideMenuBar still reveals the native bar on Alt — suppress that too.
  // The application menu stays installed so its accelerators keep working.
  if (process.platform !== 'darwin') win.setMenuBarVisibility(false)

  if (state.maximized) win.maximize()
  trackWindowState(win)

  if (DEV_URL) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
