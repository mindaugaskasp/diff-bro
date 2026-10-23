// The renderer names a target, never a path or a command: both are computed here.
import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { promisify } from 'util'
import { t } from './i18n'
import { claudeSetup } from './claudeSetup'
import {
  claudeCliCandidates,
  codeAddArgs,
  codeRemoveArgs,
  desktopConfigPath,
  entryStatus,
  mergedDesktopConfig,
  readConfigText,
  serverEntryOf
} from './claudeConnectCore'

const run = promisify(execFile)
const TIMEOUT_MS = 20_000
// The CLI is the user's own app; still, registering a server needs no network of it.
const QUIET = { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1' }

const where = () => ({ home: homedir(), platform: process.platform, appData: process.env.APPDATA })
const currentSetup = () =>
  claudeSetup({ exePath: process.execPath, appPath: app.isPackaged ? null : app.getAppPath() })
const cliPath = () => claudeCliCandidates(where()).find((p) => existsSync(p)) ?? null

function statusIn(path, setup) {
  const read = readConfigText(path)
  return read.error ? 'unknown' : entryStatus(serverEntryOf(read.text), setup)
}

function appsState() {
  const setup = currentSetup()
  const desktop = desktopConfigPath(where())
  return {
    code: { available: !!cliPath(), status: statusIn(join(homedir(), '.claude.json'), setup) },
    desktop: desktop && {
      available: existsSync(dirname(desktop)),
      status: statusIn(desktop, setup)
    }
  }
}

async function connectCode(setup) {
  const cli = cliPath()
  if (!cli) return { error: 'not-installed' }
  const opts = { cwd: homedir(), timeout: TIMEOUT_MS, env: { ...process.env, ...QUIET } }
  try {
    if (appsState().code.status !== 'absent') await run(cli, codeRemoveArgs(), opts)
    await run(cli, codeAddArgs(setup), opts)
    return { ok: true }
  } catch {
    return { error: 'cli-failed' }
  }
}

function connectDesktop(setup) {
  const path = desktopConfigPath(where())
  if (!path || !existsSync(dirname(path))) return { error: 'not-installed' }
  const read = readConfigText(path)
  if (read.error) return read
  const merged = mergedDesktopConfig(read.text, setup)
  if (merged.error) return merged
  if (read.text != null) writeFileSync(`${path}.diffbro-backup`, read.text, { mode: 0o600 })
  writeFileSync(`${path}.tmp`, merged.text, { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
  return { ok: true }
}

const CONNECT = { code: connectCode, desktop: connectDesktop }

async function confirmed(sender, target, setup) {
  const isCode = target === 'code'
  const { response } = await dialog.showMessageBox(
    BrowserWindow.fromWebContents(sender) ?? undefined,
    {
      type: 'question',
      buttons: [t('dialog.connect'), t('common.cancel')],
      defaultId: 0,
      cancelId: 1,
      message: t(isCode ? 'dialog.connectClaudeCode' : 'dialog.connectClaudeDesktop'),
      detail: isCode ? setup.cli : t('dialog.connectClaudeDesktopDetail')
    }
  )
  return response === 0
}

export function registerClaudeConnectIpc() {
  ipcMain.handle('claude:apps', () => appsState())
  ipcMain.handle('claude:connectApp', async (e, target) => {
    if (!Object.hasOwn(CONNECT, target)) return { error: 'bad-request' }
    const setup = currentSetup()
    if (!(await confirmed(e.sender, target, setup))) return { canceled: true, apps: appsState() }
    const result = await CONNECT[target](setup)
    return { ...result, apps: appsState() }
  })
}
