// Opening a stored link is the one place a snippet can reach outside the offline
// sandbox, so it is fenced hard: the URL is validated against the strict
// claude.ai allowlist (linkPolicy.isClaudeUrl) IN THE MAIN PROCESS — never trust
// the renderer — and the user confirms before the OS browser is handed the URL.
// Everything else is refused; there is no open-any-URL surface.
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { isClaudeUrl, isSafeExternalUrl } from './linkPolicy'

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

  // A URL snippet's link. The user saved it here themselves — such snippets are
  // never exported or imported — but main still fences the scheme and asks
  // before the OS browser is handed anything.
  ipcMain.handle('link:open', async (e, url) => {
    if (!isSafeExternalUrl(url)) return { error: 'not-allowed' }
    const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const { response } = await dialog.showMessageBox(parent, {
      type: 'question',
      buttons: ['Open in browser', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'Open this link in your browser?',
      detail: `${url}\n\nDiff Bro itself stays offline; your browser does not.`
    })
    if (response !== 0) return { canceled: true }
    await shell.openExternal(url)
    return { ok: true }
  })
}
