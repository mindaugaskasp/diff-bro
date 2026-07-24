import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, stat } from 'fs/promises'
import { basename, resolve, sep } from 'path'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import { readSettings } from './appData'
import { readXlsx } from './xlsx/index'

// Per-file-type size guards. Mirrors the renderer's FILE_TYPE_LIMITS
// (stores/settingsStore.js) — the renderer owns the slider UI; main enforces
// independently so a hand-edited settings.json can't wedge the app. Keep the
// numbers in sync with that file. `cap` is the hard ceiling: for .xlsx it's also
// the reader's compressed-input limit, so "Load anyway" works up to the same
// number the slider maxes at, and the two can never disagree.
const TYPE_LIMITS = {
  text: { default: 10, cap: 200 },
  spreadsheet: { default: 25, cap: 100 }
}

function fileTypeFor(name) {
  return /\.xlsx$/i.test(name) ? 'spreadsheet' : 'text'
}

// The soft prompt threshold in bytes for a type: the user's setting, floored so
// a bad value can't disable the guard and capped at the type's ceiling. Read
// fresh each time so a change applies without a restart.
function limitBytesFor(type) {
  const spec = TYPE_LIMITS[type] ?? TYPE_LIMITS.text
  const configured = Number(readSettings().fileSizeLimitsMb?.[type])
  const mb =
    Number.isFinite(configured) && configured >= 1 ? Math.min(configured, spec.cap) : spec.default
  return mb * 1024 * 1024
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

// Local zip signature ("PK\x03\x04"). Gated on the .xlsx extension too, so a
// plain .zip the user drops isn't treated as a spreadsheet.
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])
function looksLikeXlsx(name, buffer) {
  return /\.xlsx$/i.test(name) && buffer.length >= 4 && buffer.subarray(0, 4).equals(ZIP_MAGIC)
}

function readXlsxForRenderer(buffer, filePath, name, size) {
  try {
    // The reader's compressed-input ceiling is the spreadsheet cap, so it agrees
    // with the size prompt: anything the user could "Load anyway" also parses.
    const { sheets } = readXlsx(buffer, {
      maxInputBytes: TYPE_LIMITS.spreadsheet.cap * 1024 * 1024
    })
    return { path: filePath, name, size, kind: 'spreadsheet', sheets }
  } catch (err) {
    // XlsxError (bomb / doctype / unzip / format / parse) or anything
    // unexpected — not a loadable comparison; surface a polite reason.
    return {
      error: 'xlsx',
      name,
      path: filePath,
      message: err?.message ?? 'unreadable spreadsheet'
    }
  }
}

async function readFileForRenderer(win, filePath, opts = {}) {
  const name = basename(filePath)

  const { size } = await stat(filePath)
  if (size > limitBytesFor(fileTypeFor(name))) {
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

  // .xlsx is a zip (so it trips the binary sniff below): detect it first and
  // parse to a spreadsheet grid in the main process. Parsing stays here, never
  // in the renderer — it's hostile binary input (see src/main/xlsx/).
  if (looksLikeXlsx(name, buffer)) return readXlsxForRenderer(buffer, filePath, name, size)

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
