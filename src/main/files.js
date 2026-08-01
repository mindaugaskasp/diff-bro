import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import { readFile, stat, writeFile } from 'fs/promises'
import { basename, resolve, sep } from 'path'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import { readSettings } from './appData'
import { readXlsx } from './xlsx/index'
import { filtersFor } from './fileFilters'
import { clipboardFilePaths } from './clipboardFiles'

// Mirrors the renderer's FILE_TYPE_LIMITS; main enforces independently so a
// hand-edited settings.json can't wedge the app. Keep the numbers in sync.
const TYPE_LIMITS = {
  text: { default: 10, cap: 200 },
  spreadsheet: { default: 25, cap: 100 }
}

// Past this a text file is compared STREAMED — indexed by line and read a
// window at a time — instead of being loaded whole into an editor model.
// Three times the 10 MB default soft prompt, so an ordinarily-large file keeps
// the full editor (highlighting, search, save, share) and only genuinely
// unmanageable ones give those up; an editor model plus its tokenizer costs
// several times the file's own size, which is what stops paying off here.
export const STREAM_THRESHOLD_BYTES = 32 * 1024 * 1024

function fileTypeFor(name) {
  return /\.xlsx$/i.test(name) ? 'spreadsheet' : 'text'
}

// Soft-prompt threshold in bytes: the user's setting, floored + capped, read
// fresh each call.
function limitBytesFor(type) {
  const spec = TYPE_LIMITS[type] ?? TYPE_LIMITS.text
  const configured = Number(readSettings().fileSizeLimitsMb?.[type])
  const mb =
    Number.isFinite(configured) && configured >= 1 ? Math.min(configured, spec.cap) : spec.default
  return mb * 1024 * 1024
}

// Provenance allowlist. file:read serves ONLY paths the user chose (open dialog
// or a real drop). docs/standards.md assumes a compromised renderer, where a raw path
// arg would be an arbitrary-file-read primitive (SSH keys, vault.key, …), so a
// path is readable only after being registered here through a trusted channel.
const allowedPaths = new Set()
// Bounded + FIFO: the current comparison's two paths are the most recently
// added, so evicting the oldest never revokes a path still in use.
const MAX_ALLOWED_PATHS = 64

// A path named on the app's own command line carries the same authority as one
// picked in the open dialog: the user typed it in their shell. Vouching for it
// HERE keeps the renderer unable to read anything it was not handed.
export function allowCliPath(filePath) {
  allow(filePath)
}

function allow(filePath) {
  if (typeof filePath !== 'string' || !filePath) return
  const abs = resolve(filePath)
  allowedPaths.delete(abs) // re-add moves it to the end of the Set's order
  allowedPaths.add(abs)
  if (allowedPaths.size > MAX_ALLOWED_PATHS) {
    allowedPaths.delete(allowedPaths.values().next().value)
  }
}

// Belt and braces: never serve anything under userData (keys, config), however
// the path was obtained.
function isUnderUserData(filePath) {
  const abs = resolve(filePath)
  const base = resolve(app.getPath('userData'))
  return abs === base || abs.startsWith(base + sep)
}

// The read gate, as one question. Exported so the streamed comparison can ask
// it too — a second reader must clear the SAME bar, never keep its own list.
export function mayReadPath(filePath) {
  if (typeof filePath !== 'string' || !filePath) return false
  return allowedPaths.has(resolve(filePath)) && !isUnderUserData(filePath)
}

// Gated on the .xlsx extension too, so a plain .zip isn't read as a spreadsheet.
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

// The soft "this is big" prompt. False means the user declined, or that asking
// was not allowed here.
async function allowsLargeLoad({ win, name, size, quiet }) {
  if (size <= limitBytesFor(fileTypeFor(name))) return true
  // quiet mode (focus refresh) must never pop a dialog — skip the reload.
  if (quiet) return false
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Large file',
    message: `"${name}" is ${(size / 1024 / 1024).toFixed(1)} MB.`,
    detail: 'Diffing very large files can be slow. Load it anyway?',
    buttons: ['Load anyway', 'Cancel'],
    defaultId: 1,
    cancelId: 1
  })
  return response !== 1
}

async function readFileForRenderer(win, filePath, opts = {}) {
  const name = basename(filePath)

  const { size } = await stat(filePath)
  // Too big to hold: hand back a descriptor and let the streamed viewer index
  // it. No size prompt — streaming is the answer to the question that prompt
  // asks, so asking it would only offer a worse way to do the same thing.
  if (fileTypeFor(name) === 'text' && size > STREAM_THRESHOLD_BYTES) {
    return { path: filePath, name, size, kind: 'streamed' }
  }
  if (!(await allowsLargeLoad({ win, name, size, quiet: opts.quiet }))) return null

  const buffer = await readFile(filePath)

  // .xlsx is a zip (trips the binary sniff): parse it in main, never the
  // renderer — hostile binary input (see src/main/xlsx/).
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
  ipcMain.handle('file:open', async (e, side, format) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: `Select ${side} file`,
      properties: ['openFile'],
      filters: filtersFor(format)
    })
    if (canceled || !filePaths.length) return null
    allow(filePaths[0]) // the user picked it — now it (and quiet re-reads) may be read
    return readFileForRenderer(win, filePaths[0])
  })

  // Files copied in a file manager. The clipboard's text flavour holds only
  // their names, so reading text alone pasted those names as content. Paths go
  // through the same allow() gate as a dialog pick before anything is read.
  ipcMain.handle('clipboard:readFiles', async (e) => {
    const paths = clipboardFilePaths({
      formats: () => clipboard.availableFormats(),
      readText: (f) => clipboard.read(f),
      readBuffer: (f) => clipboard.readBuffer(f)
    }).slice(0, 2)

    const win = BrowserWindow.fromWebContents(e.sender)
    const files = []
    for (const filePath of paths) {
      const full = resolve(filePath)
      if (isUnderUserData(full)) continue
      const info = await stat(full).catch(() => null)
      if (!info?.isFile()) continue
      allow(full)
      files.push(await readFileForRenderer(win, full))
    }
    return files
  })

  // Registers a path the preload resolved from a REAL OS drop (webUtils), so an
  // invented renderer path never becomes readable.
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
    try {
      return await readFileForRenderer(BrowserWindow.fromWebContents(e.sender), filePath, opts)
    } catch (err) {
      // A path can be a directory, gone, or unreadable — from a drop as easily
      // as from the command line. Answer with a shape; a rejected invoke would
      // surface in the renderer as a throw nobody is positioned to catch.
      return {
        error: 'unreadable',
        name: basename(filePath),
        path: filePath,
        message: err?.message
      }
    }
  })

  // Save-dialog + write for the diff HTML export. The renderer builds the whole
  // self-contained document (utils/diffHtml.js); main only writes it where the
  // user chooses. Plain text out — never touches the allowed-paths read gate.
  ipcMain.handle('diff:exportHtml', async (e, payload) => {
    const { html, name } = payload || {}
    if (typeof html !== 'string') return { error: 'bad-args' }
    const win = BrowserWindow.fromWebContents(e.sender)
    const safe = String(name || 'diff').replace(/[\\/:*?"<>|]/g, '-')
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export diff as HTML',
      defaultPath: `${safe}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    await writeFile(filePath, html, 'utf8')
    return { ok: true, path: filePath }
  })
}
