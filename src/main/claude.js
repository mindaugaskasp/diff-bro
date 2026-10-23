// The renderer names no file and never sees a key: summaries out, one proposal by id.
import { BrowserWindow, app, ipcMain } from 'electron'
import { mkdirSync, watch } from 'fs'
import { getVaultKey } from './vault'
import { GRANT_OFF, signGrant, verifyGrant } from './mcpGrant'
import { claudeSetup } from './claudeSetup'
import {
  claudePaths,
  clearActivity,
  readActivity,
  readGrantRecord,
  writeGrantRecord
} from './claudeFiles'
import { discardProposal, listProposals, proposalSummary, readProposal } from './inboxStore'

const isGrantShape = (g) =>
  g !== null &&
  typeof g === 'object' &&
  typeof g.enabled === 'boolean' &&
  g.scopes !== null &&
  typeof g.scopes === 'object'

const keyOrNull = () => getVaultKey().catch(() => null)

async function connectionState(paths) {
  const key = await keyOrNull()
  const grant = key ? verifyGrant(key, readGrantRecord(paths.grant)) : GRANT_OFF
  const setup = claudeSetup({
    exePath: process.execPath,
    appPath: app.isPackaged ? null : app.getAppPath()
  })
  return { ...grant, keyError: !key, setup: { cli: setup.cli, desktopJson: setup.desktopJson } }
}

function watchInbox(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  let pending = null
  const notify = () => {
    pending = null
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('inbox:changed')
  }
  watch(dir, () => {
    pending ??= setTimeout(notify, 150)
  })
}

function registerInboxIpc(paths) {
  ipcMain.handle('inbox:list', async () => {
    const key = await keyOrNull()
    return key ? listProposals(paths.inbox, key, Date.now()).map(proposalSummary) : []
  })
  ipcMain.handle('inbox:read', async (_e, id) => {
    const key = await keyOrNull()
    const proposal = key && readProposal(paths.inbox, key, id, Date.now())
    return proposal ? { ...proposalSummary(proposal), body: proposal.body } : null
  })
  ipcMain.handle('inbox:discard', (_e, id) => ({ ok: discardProposal(paths.inbox, id) }))
  watchInbox(paths.inbox)
}

export function registerClaudeIpc() {
  const paths = claudePaths(app.getPath('userData'))
  ipcMain.handle('claude:connection', () => connectionState(paths))
  ipcMain.handle('claude:setConnection', async (_e, grant) => {
    if (!isGrantShape(grant)) return { error: 'bad-request' }
    const key = await keyOrNull()
    if (!key) return { error: 'vault-key-unavailable' }
    writeGrantRecord(paths.grant, signGrant(key, grant, Date.now()))
    return connectionState(paths)
  })
  ipcMain.handle('claude:activity', () => readActivity(paths.activity))
  ipcMain.handle('claude:clearActivity', () => {
    clearActivity(paths.activity)
    return { ok: true }
  })
  registerInboxIpc(paths)
}
