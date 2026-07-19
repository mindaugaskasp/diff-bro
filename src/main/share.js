// Secure diff sharing — Electron glue (dialogs, key persistence, IPC).
// All actual crypto lives in sealing.js, which is pure and unit-tested.
//
// Every install has two keypairs (generated on first use, private halves
// wrapped by the OS keychain via safeStorage). Peers exchange .diffbrokey
// files (public halves only) out of band and import them via "Add Trusted
// Key" — the exchange must happen in BOTH directions before sharing works,
// because a share file is addressed to one specific recipient.
import { app, clipboard, dialog, ipcMain, safeStorage } from 'electron'
import { readFile, stat, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import {
  KEY_FORMAT,
  createIdentityKeys,
  fingerprint,
  openSealed,
  sealEntry,
  ttlError
} from './sealing'

const PLAIN_PREFIX = 'plain:'

// Reject absurdly large attacker-supplied files before JSON.parse.
const MAX_SHARE_FILE_BYTES = 64 * 1024 * 1024
const MAX_KEY_FILE_BYTES = 64 * 1024

const privPath = () => join(app.getPath('userData'), 'identity.key')
const pubPath = () => join(app.getPath('userData'), 'identity.pub')
const trustPath = () => join(app.getPath('userData'), 'trusted-keys.json')

export async function getIdentity() {
  try {
    const [rawPriv, rawPub] = await Promise.all([
      readFile(privPath()),
      readFile(pubPath(), 'utf-8')
    ])
    const privJson =
      rawPriv.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX
        ? rawPriv.subarray(PLAIN_PREFIX.length).toString()
        : safeStorage.decryptString(rawPriv)
    return { priv: JSON.parse(privJson), pub: JSON.parse(rawPub) }
  } catch {
    const { priv, pub } = createIdentityKeys()
    const privJson = JSON.stringify(priv)
    const out = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(privJson)
      : Buffer.from(PLAIN_PREFIX + privJson)
    await writeFile(privPath(), out, { mode: 0o600 })
    await writeFile(pubPath(), JSON.stringify(pub, null, 2))
    return { priv, pub }
  }
}

async function readTrusted() {
  try {
    const list = JSON.parse(await readFile(trustPath(), 'utf-8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function registerShareIpc() {
  ipcMain.handle('share:listTrusted', async () => {
    return (await readTrusted()).map(({ fingerprint: fp, label }) => ({ fingerprint: fp, label }))
  })

  // Fingerprint of this install's own identity. Calling this creates the
  // keypairs on first use, so the share dialog can onboard a fresh install
  // without any manual "generate keys" step.
  ipcMain.handle('share:myFingerprint', async () => (await getIdentity()).pub.fingerprint)

  // Export one saved diff as a sealed file addressed to `recipientFp`.
  // entry: { name, createdAt, expiresAt, snapshot }
  ipcMain.handle('share:export', async (e, entry, recipientFp) => {
    const recipient = (await readTrusted()).find((t) => t.fingerprint === recipientFp)
    if (!recipient) return { error: 'unknown-recipient' }

    // Enforce the TTL rules at signing time too — never put our signature
    // on timestamps a receiver would have to reject.
    const invalid = ttlError(entry)
    if (invalid) return { error: invalid }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Share diff (sealed for one recipient)',
      defaultPath: `${entry.name.replace(/[^\w.-]+/g, '_')}.diffbro`,
      filters: [{ name: 'Diff Bro shared diff', extensions: ['diffbro'] }]
    })
    if (canceled || !filePath) return { canceled: true }

    const { priv, pub } = await getIdentity()
    const file = sealEntry(entry, { priv, fingerprint: pub.fingerprint }, recipient)
    await writeFile(filePath, JSON.stringify(file, null, 2))
    return { ok: true, path: filePath, to: recipient.label }
  })

  ipcMain.handle('share:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import shared diff',
      properties: ['openFile'],
      filters: [{ name: 'Diff Bro shared diff', extensions: ['diffbro'] }]
    })
    if (canceled || !filePaths.length) return { canceled: true }

    let file
    try {
      const { size } = await stat(filePaths[0])
      if (size > MAX_SHARE_FILE_BYTES) return { error: 'not-a-share-file' }
      file = JSON.parse(await readFile(filePaths[0], 'utf-8'))
    } catch {
      return { error: 'not-a-share-file' }
    }

    return openSealed(file, await getIdentity(), await readTrusted())
  })

  // Save this install's public keys so they can be handed to other machines.
  ipcMain.handle('share:exportPublicKey', async () => {
    const { pub } = await getIdentity()
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export my public key',
      defaultPath: `diffbro-${pub.fingerprint}.diffbrokey`,
      filters: [{ name: 'Diff Bro public key', extensions: ['diffbrokey'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    await writeFile(filePath, JSON.stringify(pub, null, 2))
    return { ok: true, path: filePath, fingerprint: pub.fingerprint }
  })

  // Same payload as the .diffbrokey file, on the clipboard instead of on disk,
  // so it can be pasted straight into a password manager or chat. Public
  // halves only — this is the same data the export dialog writes, and the
  // private key still never leaves this process (CLAUDE.md rule 4).
  // clipboard.writeText behaves identically on Windows, macOS and Linux.
  ipcMain.handle('share:copyPublicKey', async () => {
    const { pub } = await getIdentity()
    clipboard.writeText(JSON.stringify(pub, null, 2))
    return { ok: true, fingerprint: pub.fingerprint }
  })

  // Trust a peer's public keys (received out of band).
  ipcMain.handle('share:addTrustedKey', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Add trusted public key',
      properties: ['openFile'],
      filters: [{ name: 'Diff Bro public key', extensions: ['diffbrokey'] }]
    })
    if (canceled || !filePaths.length) return { canceled: true }

    let key, fp
    try {
      const { size } = await stat(filePaths[0])
      if (size > MAX_KEY_FILE_BYTES) throw new Error('too large')
      key = JSON.parse(await readFile(filePaths[0], 'utf-8'))
      if (key.format !== KEY_FORMAT || !key.sign || !key.box) throw new Error('bad format')
      fp = fingerprint(key.sign, key.box) // recompute — never trust the stated one
    } catch {
      return { error: 'not-a-key' }
    }
    const label = basename(filePaths[0]).replace(/\.diffbrokey$/i, '')
    const trusted = (await readTrusted()).filter((t) => t.fingerprint !== fp)
    trusted.push({ fingerprint: fp, label, sign: key.sign, box: key.box })
    await writeFile(trustPath(), JSON.stringify(trusted, null, 2))
    return { ok: true, label, fingerprint: fp }
  })
}
