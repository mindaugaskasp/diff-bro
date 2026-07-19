import { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, screen, session } from 'electron'
import { readFile, stat, writeFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from './vaultCrypt'
import { basename, join } from 'path'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import { registerShareIpc } from './share'
import appIcon from '../../resources/icon.png?asset'

const DEV_URL = process.env['ELECTRON_RENDERER_URL'] // set only in `npm run dev`

// Warn before loading files bigger than this (Monaco slows down well past it).
const LARGE_FILE_BYTES = 10 * 1024 * 1024

// ---------------------------------------------------------------------------
// Docker / headless-CI support: the container has no GPU and runs as root,
// so Chromium needs its sandbox and GPU compositing turned off there.
// Set by docker/entrypoint.sh — never in normal desktop use.
// ---------------------------------------------------------------------------
if (process.env.DIFFBRO_DOCKER) {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
  app.disableHardwareAcceleration()
}

// ---------------------------------------------------------------------------
// OFFLINE GUARANTEE
// This app must never send anything over the network. All requests are
// blocked at the session level; only local schemes are allowed. In dev mode
// the Vite dev server (localhost) is additionally allowed for HMR.
// ---------------------------------------------------------------------------
function installNetworkKillSwitch() {
  // Deny every Chromium permission request (camera, geolocation, midi,
  // notifications, …) — nothing in this app needs any of them.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url
    const isLocalScheme =
      url.startsWith('file://') ||
      url.startsWith('devtools://') ||
      url.startsWith('blob:') ||
      url.startsWith('data:')
    const isDevServer =
      !!DEV_URL &&
      (url.startsWith(DEV_URL) ||
        url.startsWith('ws://localhost') ||
        url.startsWith('ws://127.0.0.1'))
    callback({ cancel: !(isLocalScheme || isDevServer) })
  })
}

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

function createWindow() {
  const state = loadWindowState()
  const win = new BrowserWindow({
    width: state.width ?? 1400,
    height: state.height ?? 900,
    x: state.x,
    y: state.y,
    // Fixed size: drag-to-resize is disabled, but move/maximize still work
    // (and window-state persistence above still tracks position + maximized).
    resizable: false,
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

// --- App menu: file actions forwarded to the renderer over IPC ---

function sendToFocused(action) {
  // Fall back to the first window: under bare Xvfb (Docker test env, no
  // window manager) no window ever reports keyboard focus.
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('menu:action', action)
}

function installMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Left…',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendToFocused('open-left')
        },
        {
          label: 'Open Right…',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendToFocused('open-right')
        },
        { type: 'separator' },
        { label: 'Save Diff…', accelerator: 'CmdOrCtrl+S', click: () => sendToFocused('save') },
        {
          label: 'Share Diff…',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendToFocused('share-current')
        },
        { type: 'separator' },
        {
          label: 'Import Shared Diff…',
          accelerator: 'CmdOrCtrl+I',
          click: () => sendToFocused('import-shared')
        },
        { label: 'Export My Public Key…', click: () => sendToFocused('export-pubkey') },
        { label: 'Add Trusted Key…', click: () => sendToFocused('add-trusted-key') },
        { type: 'separator' },
        {
          label: 'Swap Sides',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendToFocused('swap')
        },
        { label: 'Clear', accelerator: 'CmdOrCtrl+K', click: () => sendToFocused('clear') },
        { type: 'separator' },
        {
          label: 'Paste Text Mode',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendToFocused('toggle-paste')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Split View',
          accelerator: 'CmdOrCtrl+\\',
          click: () => sendToFocused('toggle-split')
        },
        {
          label: 'Toggle Light/Dark Theme',
          accelerator: 'CmdOrCtrl+D',
          click: () => sendToFocused('toggle-theme')
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------------------------------------------------------------------------
// Saved-diff vault. Saved diffs live in the renderer's localStorage as
// AES-256-GCM ciphertext, but all crypto happens HERE: the renderer only
// ever sees `vault:encrypt` / `vault:decrypt` — the key itself never
// crosses the IPC boundary, so a compromised renderer cannot exfiltrate it.
// The 256-bit key is generated once per install and protected at rest by
// the OS keychain via safeStorage (DPAPI on Windows, Keychain on macOS,
// libsecret on Linux). Where no keychain exists (e.g. the Docker test
// container) the key file is stored as-is — the entries are still
// encrypted, the key just has no OS-level protection.
//
// ---------------------------------------------------------------------------
const PLAIN_PREFIX = 'plain:'

let vaultKeyPromise = null

function getVaultKey() {
  vaultKeyPromise ??= (async () => {
    const keyPath = join(app.getPath('userData'), 'vault.key')
    try {
      const raw = await readFile(keyPath)
      if (raw.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX) {
        return Buffer.from(raw.subarray(PLAIN_PREFIX.length).toString(), 'base64')
      }
      return Buffer.from(safeStorage.decryptString(raw), 'base64')
    } catch {
      // Missing or undecryptable key file: start a fresh key. Old entries
      // become unreadable and are purged by the renderer on decrypt failure.
      const key = randomBytes(32).toString('base64')
      const out = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(key)
        : Buffer.from(PLAIN_PREFIX + key)
      await writeFile(keyPath, out, { mode: 0o600 })
      return Buffer.from(key, 'base64')
    }
  })()
  return vaultKeyPromise
}

// plaintext/aad are strings; result mirrors what the renderer stores.
ipcMain.handle('vault:encrypt', async (e, plaintext, aad) =>
  vaultEncrypt(await getVaultKey(), plaintext, aad)
)

// null when the entry fails authentication (tampered metadata, rotated key).
ipcMain.handle('vault:decrypt', async (e, box, aad) => vaultDecrypt(await getVaultKey(), box, aad))

// --- Custom in-app menu bar (Windows/Linux) needs these two escapes ---

ipcMain.handle('app:toggleDevTools', (e) => e.sender.toggleDevTools())
ipcMain.handle('app:quit', () => app.quit())

// --- IPC: file access lives in the main process only ---

// Open dialog + read file. side: 'left' | 'right' (used only for dialog title)
ipcMain.handle('file:open', async (e, side) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: `Select ${side} file`,
    properties: ['openFile']
  })
  if (canceled || !filePaths.length) return null
  return readFileForRenderer(win, filePaths[0])
})

// Read a path directly (drag & drop, and quiet focus-refresh re-reads)
ipcMain.handle('file:read', async (e, filePath, opts) => {
  return readFileForRenderer(BrowserWindow.fromWebContents(e.sender), filePath, opts)
})

async function readFileForRenderer(win, filePath, opts = {}) {
  const name = basename(filePath)

  const { size } = await stat(filePath)
  if (size > LARGE_FILE_BYTES) {
    // quiet mode (focus refresh) must never pop a dialog — skip the reload.
    if (opts.quiet) return null
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Large file',
      message: `"${name}" is ${(size / 1024 / 1024).toFixed(1)} MB.`,
      detail: 'Diffing very large files can be slow. Load it anyway?',
      buttons: ['Load anyway', 'Cancel'],
      defaultId: 1,
      cancelId: 1
    })
    if (response === 1) return null
  }

  const buffer = await readFile(filePath)

  // Binary detection: a NUL byte in the first 8 KB means this is not text.
  if (buffer.subarray(0, 8192).includes(0)) {
    return { error: 'binary', name, path: filePath }
  }

  // Decode with detected encoding; anything iconv can't handle falls back to
  // UTF-8 so the user at least sees something rather than an error.
  const detected = chardet.detect(buffer) ?? 'UTF-8'
  const encoding = iconv.encodingExists(detected) ? detected : 'UTF-8'
  const content = iconv.decode(buffer, encoding)

  return { path: filePath, name, content, encoding, size }
}

// Only one instance/window: a second launch (double-clicking the exe again,
// or the installer's "run after install" while one is already open) hands
// its args off here and quits instead of opening a second window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    installNetworkKillSwitch()
    installMenu()
    registerShareIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
