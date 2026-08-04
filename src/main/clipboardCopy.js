// "Copy as file" — the glue between clipboardStage (bytes → a path) and
// clipboardWrite (a path → the OS flavours).
//
// The handler takes BYTES AND A NAME, never a path. That asymmetry is the point:
// clipboardFiles.js already treats paths READ off the clipboard as untrusted,
// and letting the renderer name a file to stage would be the same mistake in the
// other direction. There is no IPC surface here that can put an arbitrary
// existing file on the clipboard.
import { app, clipboard, ipcMain } from 'electron'
import { fileFlavours } from './clipboardWrite'
import { sweepStage, stageFile } from './clipboardStage'

const MAX_COPY_BYTES = 64 * 1024 * 1024

/** Put an already-staged path on the clipboard as a file. */
export function copyPathToClipboard(path) {
  const flavours = fileFlavours([path], process.platform)
  if (!flavours.length) return { error: 'unsupported' }
  clipboard.clear()
  for (const { format, buffer } of flavours) clipboard.writeBuffer(format, buffer)
  return { ok: true }
}

/**
 * Stage bytes under a display name, then copy that file.
 * @returns {Promise<{ ok: true, name: string } | { error: string }>}
 */
export async function copyBytesAsFile(name, bytes) {
  const staged = await stageFile({ name, bytes })
  if (!staged.ok) return staged
  const copied = copyPathToClipboard(staged.path)
  return copied.ok ? { ok: true, name: staged.path.split(/[\\/]/).pop() } : copied
}

export function registerClipboardCopyIpc() {
  // Swept on launch as well as on quit: a crash skips will-quit, and plaintext
  // surviving a reboot in the temp directory is the failure that matters.
  sweepStage()
  app.on('will-quit', () => {
    sweepStage()
  })

  ipcMain.handle('clipboard:writeFile', async (e, name, content) => {
    if (typeof name !== 'string' || !name.trim()) return { error: 'bad-request' }
    const isText = typeof content === 'string'
    if (!isText && !(content instanceof Uint8Array)) return { error: 'bad-request' }
    const bytes = isText ? Buffer.from(content, 'utf8') : Buffer.from(content)
    if (bytes.length > MAX_COPY_BYTES) return { error: 'too-large' }
    return copyBytesAsFile(name, bytes)
  })

  // Whether this platform can carry a file on the clipboard at all, so the UI
  // hides the command rather than offering one that silently does nothing.
  ipcMain.handle('clipboard:canWriteFile', () => fileFlavours(['/x'], process.platform).length > 0)
}
