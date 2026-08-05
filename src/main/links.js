// Opening a stored link is the one place a snippet can reach outside the offline
// sandbox, so it is fenced hard: the URL is validated against the strict
// claude.ai allowlist (linkPolicy.isClaudeUrl) IN THE MAIN PROCESS — never trust
// the renderer — and the user confirms before the OS browser is handed the URL.
// Everything else is refused; there is no open-any-URL surface.
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { isClaudeUrl, isSafeExternalUrl } from './linkPolicy'
import { t } from './i18n'

export function registerLinkIpc() {
  ipcMain.handle('link:openClaude', async (e, url) => {
    if (!isClaudeUrl(url)) return { error: 'not-allowed' }
    const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const { response } = await dialog.showMessageBox(parent, {
      type: 'question',
      buttons: [t('dialog.openInBrowser'), t('common.cancel')],
      defaultId: 0,
      cancelId: 1,
      message: t('dialog.openClaudeLink'),
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
      buttons: [t('dialog.openInBrowser'), t('common.cancel')],
      defaultId: 0,
      cancelId: 1,
      message: t('dialog.openLink'),
      detail: t('dialog.linkLeavesApp', { url })
    })
    if (response !== 0) return { canceled: true }
    await shell.openExternal(url)
    return { ok: true }
  })
}
