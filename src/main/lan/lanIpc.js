import { app, BrowserWindow, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { hostname } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { createLan } from './lan'
import { peerRows } from './peers'
import { coalesce } from './rateLimit'
import { readComputerName } from './computerName'
import { readLanSettings, writeLanSettings } from './lanStore'
import { SILENCE_CHOICES, normalizeLanSettings, setPopups, silence } from './lanSettings'
import { refreshTrustedFps, registerItemsIpc, setUpItems } from './itemsIpc'
import { registerRevokeIpc, setUpRevoke } from './revokeIpc'
import { getIdentity } from '../share'
import { cancelPairing, registerPairingIpc, setUpPairing } from './pairingIpc'
import { readTrusted } from '../trustedKeys'
import { appendLog } from '../logger'

const settingsFile = () => join(app.getPath('userData'), 'lan.json')
const run = async (cmd, args) => (await promisify(execFile)(cmd, args)).stdout

let lan = null
let computerName = ''
let settings = null

export const lanService = () => lan

const OFF = { enabled: false, visible: false, popups: true, silencedUntil: 0, name: '' }

export async function lanSnapshot() {
  const trusted = await readTrusted()
  const { enabled, visible, popups, silencedUntil, name } = lan?.settings() ?? settings ?? OFF
  return {
    enabled,
    visible,
    popups,
    silencedUntil,
    name,
    online: !!lan?.isOnline(),
    peers: peerRows(lan ? lan.peers() : [], trusted)
  }
}

export async function broadcastLan() {
  await refreshTrustedFps()
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
    log: (message) => appendLog({ source: 'lan', level: 'info', message }),
    // One spoofed packet can carry many records; each would otherwise re-read the trust store.
    onChange: coalesce(() => broadcastLan().catch(() => {}), 100)
  })
  setUpPairing({ lan, identity, onTrustChanged: () => broadcastLan().catch(() => {}) })
  setUpItems(lan)
  setUpRevoke({ lan, identity, onTrustChanged: () => broadcastLan().catch(() => {}) })
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
  return saveSettings(next)
}

async function saveSettings(next) {
  settings = next
  if (!next.enabled) cancelPairing()
  writeLanSettings(settingsFile(), next)
  await lan?.apply(next)
  return lanSnapshot()
}

export function silenceLan(choice) {
  if (!SILENCE_CHOICES.includes(choice)) return lanSnapshot()
  return saveSettings(silence(lan?.settings() ?? settings, choice, Date.now()))
}

export function registerLanIpc({ log }) {
  ipcMain.handle('lan:state', () => lanSnapshot())
  ipcMain.handle('lan:update', (_e, patch) => updateLanSettings(patch))
  ipcMain.handle('lan:silence', (_e, choice) => silenceLan(choice))
  registerItemsIpc()
  registerRevokeIpc()
  registerPairingIpc({ nameOf: (fp) => lan?.peers().find((p) => p.fp === fp)?.name ?? fp })
  startLanSharing().catch((err) => log(err.message))
}
