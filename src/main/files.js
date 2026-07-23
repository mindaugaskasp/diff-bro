import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, stat } from 'fs/promises'
import { basename, resolve, sep } from 'path'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import { readSettings } from './appData'

// Warn before loading files bigger than the user's configured comparison limit
// (Monaco slows down well past it). The default is a safe 10 MB; the user can
// raise it in Settings, accepting the performance hit. Read fresh each time so
// the choice applies without a restart, and floored so a bad value can't
// disable the guard entirely.
const DEFAULT_LARGE_FILE_MB = 10
function largeFileBytes() {
  const mb = Number(readSettings().maxComparisonFileMb)
  return (Number.isFinite(mb) && mb >= 1 ? mb : DEFAULT_LARGE_FILE_MB) * 1024 * 1024
}

// Provenance allowlist. `file:read` is only ever meant to serve a path the
// user actually chose — via the open dialog, or by physically dragging a file
// onto the window. CLAUDE.md's threat model assumes the renderer can be
// compromised (see vault.js), and a raw path argument from a compromised
// renderer would turn `file:read` into an arbitrary-file-read primitive: SSH
// keys, browser profiles, cloud tokens — and, on installs with no OS keychain
// (the `plain:` fallback), vault.key / identity.key themselves, defeating the
// "key never enters the renderer" guarantee. So a path is readable only after
// it has been registered here through a trusted channel.
const allowedPaths = new Set()
// Bound the allowlist so a long session can't grow it without limit, and so a
// path doesn't stay readable forever after the user has moved on. The current
// comparison's two paths are always the most recently allowed (re-inserting
// refreshes recency), so FIFO eviction of the oldest entry never revokes a
// path still in use, including its quiet focus-refresh re-reads.
const MAX_ALLOWED_PATHS = 64

function allow(filePath) {
  if (typeof filePath !== 'string' || !filePath) return
  const abs = resolve(filePath)
  allowedPaths.delete(abs) // re-add moves it to the end of the Set's order
  allowedPaths.add(abs)
  if (allowedPaths.size > MAX_ALLOWED_PATHS) {
    allowedPaths.delete(allowedPaths.values().next().value)
  }
}

// Belt and braces: never serve anything inside userData (vault.key,
// identity.key, trusted-keys.json, config) regardless of how the path was
// obtained. Nothing the user opens or drops legitimately lives there.
function isUnderUserData(filePath) {
  const abs = resolve(filePath)
  const base = resolve(app.getPath('userData'))
  return abs === base || abs.startsWith(base + sep)
}

async function readFileForRenderer(win, filePath, opts = {}) {
  const name = basename(filePath)

  const { size } = await stat(filePath)
  if (size > largeFileBytes()) {
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

// File access lives in the main process only — the renderer never touches fs.
export function registerFileIpc() {
  // Open dialog + read file. side: 'left' | 'right' (dialog title only)
  ipcMain.handle('file:open', async (e, side) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: `Select ${side} file`,
      properties: ['openFile']
    })
    if (canceled || !filePaths.length) return null
    allow(filePaths[0]) // the user picked it — now it (and quiet re-reads) may be read
    return readFileForRenderer(win, filePaths[0])
  })

  // Registers a path the preload resolved from a REAL OS drag-drop
  // (webUtils.getPathForFile on an actual dropped File). The preload calls
  // this before the renderer asks to read the file, so a genuinely dropped
  // path becomes readable while a path the renderer merely invents never
  // passes through here and stays denied.
  ipcMain.handle('file:allowDropPath', (e, filePath) => {
    allow(filePath)
    return true
  })

  // Read a path directly (drag & drop, and quiet focus-refresh re-reads).
  // Only paths that came from the open dialog or a real drop are honoured.
  ipcMain.handle('file:read', async (e, filePath, opts) => {
    if (typeof filePath !== 'string' || !allowedPaths.has(resolve(filePath))) {
      return { error: 'not-permitted' }
    }
    if (isUnderUserData(filePath)) return { error: 'not-permitted' }
    return readFileForRenderer(BrowserWindow.fromWebContents(e.sender), filePath, opts)
  })
}
