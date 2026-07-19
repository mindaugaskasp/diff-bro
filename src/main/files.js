import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, stat } from 'fs/promises'
import { basename } from 'path'
import chardet from 'chardet'
import iconv from 'iconv-lite'

// Warn before loading files bigger than this (Monaco slows down well past it).
const LARGE_FILE_BYTES = 10 * 1024 * 1024

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
    return readFileForRenderer(win, filePaths[0])
  })

  // Read a path directly (drag & drop, and quiet focus-refresh re-reads)
  ipcMain.handle('file:read', async (e, filePath, opts) =>
    readFileForRenderer(BrowserWindow.fromWebContents(e.sender), filePath, opts)
  )
}
