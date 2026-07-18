import { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, session } from 'electron'
import { readFile, stat, writeFile } from 'fs/promises'
import { randomBytes } from 'crypto'
import { basename, join } from 'path'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import { registerShareIpc } from './share'

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
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url
    const isLocalScheme =
      url.startsWith('file://') ||
      url.startsWith('devtools://') ||
      url.startsWith('blob:') ||
      url.startsWith('data:')
    const isDevServer =
      !!DEV_URL &&
      (url.startsWith(DEV_URL) || url.startsWith('ws://localhost') || url.startsWith('ws://127.0.0.1'))
    callback({ cancel: !(isLocalScheme || isDevServer) })
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Chromium's spellchecker downloads dictionaries from Google - keep off.
      spellcheck: false
    }
  })

  // Never open external links or navigate away from the app.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    const internal = url.startsWith('file://') || (!!DEV_URL && url.startsWith(DEV_URL))
    if (!internal) e.preventDefault()
  })

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
        { label: 'Open Left…', accelerator: 'CmdOrCtrl+1', click: () => sendToFocused('open-left') },
        { label: 'Open Right…', accelerator: 'CmdOrCtrl+2', click: () => sendToFocused('open-right') },
        { type: 'separator' },
        { label: 'Save Diff…', accelerator: 'CmdOrCtrl+S', click: () => sendToFocused('save') },
        { type: 'separator' },
        { label: 'Import Shared Diff…', accelerator: 'CmdOrCtrl+I', click: () => sendToFocused('import-shared') },
        { label: 'Export My Public Key…', click: () => sendToFocused('export-pubkey') },
        { label: 'Add Trusted Key…', click: () => sendToFocused('add-trusted-key') },
        { type: 'separator' },
        { label: 'Swap Sides', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToFocused('swap') },
        { label: 'Clear', accelerator: 'CmdOrCtrl+K', click: () => sendToFocused('clear') },
        { type: 'separator' },
        { label: 'Paste Text Mode', accelerator: 'CmdOrCtrl+T', click: () => sendToFocused('toggle-paste') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Split View', accelerator: 'CmdOrCtrl+\\', click: () => sendToFocused('toggle-split') },
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
// Saved-diff vault key. Saved diffs live in the renderer's localStorage as
// AES-GCM ciphertext; the 256-bit key is generated once per install and held
// here, protected at rest by the OS keychain via safeStorage (DPAPI on
// Windows, Keychain on macOS, libsecret on Linux). Where no keychain exists
// (e.g. the Docker test container) the key file is stored as-is — the
// entries are still encrypted, the key just has no OS-level protection.
// ---------------------------------------------------------------------------
const PLAIN_PREFIX = 'plain:'

async function getVaultKey() {
  const keyPath = join(app.getPath('userData'), 'vault.key')
  try {
    const raw = await readFile(keyPath)
    if (raw.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX) {
      return raw.subarray(PLAIN_PREFIX.length).toString()
    }
    return safeStorage.decryptString(raw)
  } catch {
    // Missing or undecryptable key file: start a fresh key. Old entries
    // become unreadable and are purged by the renderer on decrypt failure.
    const key = randomBytes(32).toString('base64')
    const out = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(key)
      : Buffer.from(PLAIN_PREFIX + key)
    await writeFile(keyPath, out, { mode: 0o600 })
    return key
  }
}

ipcMain.handle('vault:key', () => getVaultKey())

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

// Read a path directly (used by drag & drop)
ipcMain.handle('file:read', async (e, filePath) => {
  return readFileForRenderer(BrowserWindow.fromWebContents(e.sender), filePath)
})

async function readFileForRenderer(win, filePath) {
  const name = basename(filePath)

  const { size } = await stat(filePath)
  if (size > LARGE_FILE_BYTES) {
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

app.whenReady().then(() => {
  installNetworkKillSwitch()
  installMenu()
  registerShareIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
