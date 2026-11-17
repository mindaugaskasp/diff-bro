import { app, BrowserWindow, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { hostname } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { createLan } from './lan'
import { readComputerName } from './computerName'
import { readLanSettings, writeLanSettings } from './lanStore'
import { normalizeLanSettings, setPopups } from './lanSettings'
import { getIdentity } from '../share'
import { cancelPairing, registerPairingIpc, setUpPairing } from './pairingIpc'
import { readTrusted } from '../trustedKeys'

const settingsFile = () => join(app.getPath('userData'), 'lan.json')
const run = async (cmd, args) => (await promisify(execFile)(cmd, args)).stdout

let lan = null
let computerName = ''
let settings = null

export const lanService = () => lan

const OFF = { enabled: false, visible: false, popups: true, silencedUntil: 0, name: '' }

export async function lanSnapshot() {
  const trusted = new Set((await readTrusted()).map((t) => t.fingerprint))
  const { enabled, visible, popups, silencedUntil, name } = lan?.settings() ?? settings ?? OFF
  return {
    enabled,
    visible,
    popups,
    silencedUntil,
    name,
    online: !!lan?.isOnline(),
    peers: (lan ? lan.peers() : []).map((p) => ({ ...p, trusted: trusted.has(p.fp) }))
  }
}

export async function broadcastLan() {
  const snapshot = await lanSnapshot()
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('lan:changed', snapshot)
}

export async function startLanSharing() {
  computerName = await readComputerName({
    platform: process.platform,
    env: process.env,
    hostname,
    run
  })
  settings = readLanSettings(settingsFile(), computerName)
  const identity = await getIdentity()
  lan = createLan({
    settings,
    selfFp: identity.pub.fingerprint,
    onChange: () => broadcastLan().catch(() => {})
  })
  setUpPairing({ lan, identity, onTrustChanged: () => broadcastLan().catch(() => {}) })
  await lan.start()
}

export const stopLanSharing = () => lan?.stop()

const PATCH_KEYS = { enabled: 'boolean', visible: 'boolean', popups: 'boolean', name: 'string' }

function cleanPatch(patch) {
  if (!patch || typeof patch !== 'object') return {}
  return Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => PATCH_KEYS[k] && typeof v === PATCH_KEYS[k])
  )
}

export async function updateLanSettings(patch) {
  const current = lan?.settings() ?? settings
  let next = normalizeLanSettings({ ...current, ...cleanPatch(patch) }, computerName)
  if (typeof patch?.popups === 'boolean') next = setPopups(next, patch.popups)
  settings = next
  if (!next.enabled) cancelPairing()
  writeLanSettings(settingsFile(), next)
  await lan?.apply(next)
  return lanSnapshot()
}

export function registerLanIpc({ log }) {
  ipcMain.handle('lan:state', () => lanSnapshot())
  ipcMain.handle('lan:update', (_e, patch) => updateLanSettings(patch))
  registerPairingIpc({ nameOf: (fp) => lan?.peers().find((p) => p.fp === fp)?.name ?? fp })
  startLanSharing().catch((err) => log(err.message))
}
