import { clipboard, ipcMain } from 'electron'

// Writing the OS clipboard is a main-process job, exposed as window.api.copyText.
//
// The renderer cannot use navigator.clipboard: the deny-all permission handler
// (security.js — never weakened, CLAUDE.md rule 1) blocks
// clipboard-sanitized-write, so writeText() rejects with NotAllowedError. Doing
// the write here sidesteps that without touching the permission handler, and
// keeps OS access on the main side of the IPC boundary (rule 3). It is a
// local-only operation — no network — so the offline guarantees are unchanged.
//
// Cap defensively: clipboard payloads here are already size-bounded upstream
// (snippet / tool output), but never hand an unbounded renderer string to the OS.
const MAX_CLIPBOARD_BYTES = 10 * 1024 * 1024

export function registerClipboardIpc() {
  ipcMain.handle('clipboard:write', (_e, text) => {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_CLIPBOARD_BYTES) {
      return { ok: false }
    }
    clipboard.writeText(text)
    return { ok: true }
  })
}
