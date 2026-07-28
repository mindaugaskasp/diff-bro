// Opening a stored link is the one place a snippet can reach outside the offline
// sandbox, so it is fenced hard: the URL is validated against the strict
// claude.ai allowlist (linkPolicy.isClaudeUrl) IN THE MAIN PROCESS — never trust
// the renderer — and the user confirms before the OS browser is handed the URL.
// Everything else is refused; there is no open-any-URL surface.
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { isClaudeUrl } from './linkPolicy'

export function registerLinkIpc() {
  ipcMain.handle('link:openClaude', async (e, url) => {
    if (!isClaudeUrl(url)) return { error: 'not-allowed' }
    const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const { response } = await dialog.showMessageBox(parent, {
      type: 'question',
      buttons: ['Open in browser', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'Open this Claude link in your browser?',
      detail: url
    })
    if (response !== 0) return { canceled: true }
    await shell.openExternal(url)
    return { ok: true }
  })
}
