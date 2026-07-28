import { clipboard, ipcMain } from 'electron'

// Clipboard access lives in main because the renderer's navigator.clipboard is
// blocked by the deny-all permission handler (rule 1/3). Capped so an unbounded
// renderer string never reaches the OS.
const MAX_CLIPBOARD_BYTES = 10 * 1024 * 1024

export function registerClipboardIpc() {
  ipcMain.handle('clipboard:write', (_e, text) => {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_CLIPBOARD_BYTES) {
      return { ok: false }
    }
    clipboard.writeText(text)
    return { ok: true }
  })

  ipcMain.handle('clipboard:read', () => {
    const text = clipboard.readText()
    if (typeof text !== 'string') return ''
    return text.length > MAX_CLIPBOARD_BYTES ? text.slice(0, MAX_CLIPBOARD_BYTES) : text
  })
}
