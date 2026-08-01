// Secure diff sharing — Electron glue (crypto is in sealing.js). Each install
// has two keypairs (private halves wrapped by the OS keychain); peers exchange
// public .diffbrokey files both ways before a (single-recipient) share works.
import { clipboard, dialog, ipcMain, safeStorage } from 'electron'
import { readFile, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { dataFile } from './appData'
import {
  KEY_FORMAT,
  cleanLabel,
  createIdentityKeys,
  decodePublicKey,
  encodePublicKey,
  fingerprint,
  isAcceptedKeyFormat,
  openSealedWith,
  sealEntry,
  shareFilename,
  signRotation,
  verifyRotation,
  ttlError
} from './sealing'
import { openConfig, sealConfig } from './configBackup'
import { validateSnippetBundle } from './snippetSealing'

const PLAIN_PREFIX = 'plain:'

// Reject absurdly large attacker-supplied files before JSON.parse.
const MAX_SHARE_FILE_BYTES = 64 * 1024 * 1024
const MAX_KEY_FILE_BYTES = 64 * 1024

const privPath = () => dataFile('identity.key')
const pubPath = () => dataFile('identity.pub')
const trustPath = () => dataFile('trusted-keys.json')
// Keys this machine has rotated away from. They DECRYPT and nothing else — a
// diff sealed to the old key before it was replaced is still addressed to a key
// we hold, and rotating must not destroy mail already in flight.
const retiredPath = () => dataFile('retired-keys.key')

// Identity present but unloadable (locked keychain, corruption). Surface it,
// never regenerate — that would silently rotate the public key and break every
// peer's trust.
class IdentityUnavailable extends Error {
  constructor() {
    super('identity-unavailable')
    this.name = 'IdentityUnavailable'
  }
}

export async function getIdentity() {
  const [privRes, pubRes] = await Promise.allSettled([
    readFile(privPath()),
    readFile(pubPath(), 'utf-8')
  ])
  const missing = (r) => r.status === 'rejected' && r.reason?.code === 'ENOENT'

  // Only BOTH halves missing is "first run" — a partial/unreadable state must
  // never regenerate over a recoverable key.
  if (missing(privRes) && missing(pubRes)) {
    const { priv, pub } = createIdentityKeys()
    await persistIdentity(priv, pub)
    return { priv, pub }
  }
  if (privRes.status === 'rejected' || pubRes.status === 'rejected') {
    throw new IdentityUnavailable()
  }

  const identity = decodeIdentity(privRes.value, pubRes.value)
  return upgradeIdentityFormat(identity)
}

function decodeIdentity(rawPriv, rawPub) {
  try {
    const isPlain = rawPriv.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX
    // A plaintext key while the keychain works is anomalous — refuse it as
    // planted rather than adopt an attacker-supplied private key as our identity.
    if (isPlain && safeStorage.isEncryptionAvailable()) throw new IdentityUnavailable()
    const privJson = isPlain
      ? rawPriv.subarray(PLAIN_PREFIX.length).toString()
      : safeStorage.decryptString(rawPriv)
    return { priv: JSON.parse(privJson), pub: JSON.parse(rawPub) }
  } catch {
    throw new IdentityUnavailable()
  }
}

// Upgrade an older-format identity to the current format + 128-bit fingerprint,
// keeping the SAME key material, so exports aren't rejected by current peers.
async function upgradeIdentityFormat(identity) {
  const currentFp = fingerprint(identity.pub.sign, identity.pub.box)
  if (identity.pub.format === KEY_FORMAT && identity.pub.fingerprint === currentFp) return identity
  const pub = {
    format: KEY_FORMAT,
    sign: identity.pub.sign,
    box: identity.pub.box,
    fingerprint: currentFp
  }
  await persistIdentity(identity.priv, pub)
  return { priv: identity.priv, pub }
}

/**
 * Every identity this machine can DECRYPT with: the current one first, then the
 * retired ones. Nothing here is ever used to sign or seal.
 * @returns {Promise<object[]>}
 */
export async function decryptionIdentities() {
  return [await getIdentity(), ...(await readRetired())]
}

async function readRetired() {
  let raw
  try {
    raw = await readFile(retiredPath())
  } catch {
    return []
  }
  try {
    const isPlain = raw.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX
    if (isPlain && safeStorage.isEncryptionAvailable()) return []
    const json = isPlain
      ? raw.subarray(PLAIN_PREFIX.length).toString()
      : safeStorage.decryptString(raw)
    const list = JSON.parse(json)
    return Array.isArray(list) ? list.filter((k) => k?.priv?.box && k?.pub?.fingerprint) : []
  } catch {
    return []
  }
}

const wrapSecret = (json) =>
  safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(PLAIN_PREFIX + json)

/**
 * Replace this machine's identity, keeping the old one as decrypt-only.
 *
 * What this DOES buy: a leaked private key stops being able to sign new files
 * in your name, once your peers hold the new key. What it does NOT: it cannot
 * make already-sent diffs unreadable — those are encrypted to the RECIPIENT's
 * key, and yours only signed them.
 * @returns {Promise<{ ok: true, fingerprint: string, retired: number }>}
 */
export async function rotateIdentity() {
  const previous = await getIdentity()
  const next = createIdentityKeys()
  const rotation = signRotation({
    oldPriv: previous.priv,
    oldFp: previous.pub.fingerprint,
    newPriv: next.priv,
    newFp: next.pub.fingerprint
  })
  const retired = [{ priv: previous.priv, pub: previous.pub }, ...(await readRetired())]
  await writeFile(retiredPath(), wrapSecret(JSON.stringify(retired)), { mode: 0o600 })
  await persistIdentity(next.priv, { ...next.pub, rotation })
  return { ok: true, fingerprint: next.pub.fingerprint, retired: retired.length }
}

/**
 * Destroy the retired private keys. Separate and deliberate: it is the right
 * move when a key LEAKED, and it permanently gives up every unopened diff
 * addressed to those keys.
 */
export async function destroyRetiredKeys() {
  const count = (await readRetired()).length
  await rm(retiredPath(), { force: true })
  return { ok: true, destroyed: count }
}

// Private half wrapped by the OS keychain (safeStorage) where available.
async function persistIdentity(priv, pub) {
  const privJson = JSON.stringify(priv)
  const out = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(privJson)
    : Buffer.from(PLAIN_PREFIX + privJson)
  await writeFile(privPath(), out, { mode: 0o600 })
  await writeFile(pubPath(), JSON.stringify(pub, null, 2))
}

async function readTrusted() {
  try {
    const list = JSON.parse(await readFile(trustPath(), 'utf-8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

// Set/refresh the cosmetic display label (never part of the fingerprint or any
// trust check) and return the pub with it embedded.
async function pubWithLabel(rawLabel) {
  const { priv, pub } = await getIdentity()
  // null/undefined keeps the existing label; a string (even '') sets it.
  if (rawLabel == null) return pub
  const label = cleanLabel(rawLabel)
  if ((pub.label ?? '') !== label) {
    pub.label = label
    await persistIdentity(priv, pub)
  }
  return pub
}

// A recognizable filename for an exported key: "Alice-laptop-diffbro-key.diffbrokey"
// when labeled, else a fingerprint-tagged fallback.
function keyFileBasename(label, fp) {
  const slug = label.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
  return (slug ? `${slug}-diffbro-key` : `diffbro-public-key-${fp}`) + '.diffbrokey'
}

// Public key material + a RECOMPUTED fingerprint (the stated one is never
// trusted) + a default label. Throws on malformed/oversized.
async function parseKeyFileAt(path) {
  const { size } = await stat(path)
  if (size > MAX_KEY_FILE_BYTES) throw new Error('too large')
  const key = decodePublicKey(await readFile(path, 'utf-8'))
  if (!isAcceptedKeyFormat(key.format) || !key.sign || !key.box) throw new Error('bad format')
  const embedded = cleanLabel(key.label)
  return {
    key: { format: KEY_FORMAT, sign: key.sign, box: key.box },
    fp: fingerprint(key.sign, key.box),
    defaultLabel: embedded || basename(path).replace(/\.diffbrokey$/i, '')
  }
}

async function storeTrusted(key, fp, label) {
  const trusted = (await readTrusted()).filter((t) => t.fingerprint !== fp)
  trusted.push({ fingerprint: fp, label: (label || fp).trim() || fp, sign: key.sign, box: key.box })
  await writeFile(trustPath(), JSON.stringify(trusted, null, 2))
}

// Surface an unloadable identity as a plain error object rather than a rejected
// IPC promise.
const guardIdentity =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args)
    } catch (err) {
      if (err instanceof IdentityUnavailable) return { error: 'identity-unavailable' }
      throw err
    }
  }

// Size + filename-integrity guards on the untrusted file before openSealed does
// the crypto vetting. Shared by the dialog and drag-drop importers.
async function openSharedFileAt(path) {
  let file
  try {
    const { size } = await stat(path)
    if (size > MAX_SHARE_FILE_BYTES) return { error: 'not-a-share-file' }
    file = JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return { error: 'not-a-share-file' }
  }
  // A shared diff must keep its hashed filename; a renamed file is refused.
  if (file?.ciphertext && basename(path) !== shareFilename(file)) {
    return { error: 'renamed' }
  }
  return openSealedWith(file, await decryptionIdentities(), await readTrusted())
}

export function registerShareIpc() {
  ipcMain.handle('share:listTrusted', async () => {
    return (await readTrusted()).map(({ fingerprint: fp, label }) => ({ fingerprint: fp, label }))
  })

  // Creates the keypairs on first use (no manual "generate keys" step); null if
  // the identity can't be loaded.
  // Rotation is deliberate and irreversible in one direction: the old key is
  // retired (decrypt-only), never deleted, so unopened diffs addressed to it
  // still open.
  ipcMain.handle(
    'share:rotate',
    guardIdentity(async () => rotateIdentity())
  )
  ipcMain.handle('share:retiredCount', async () => (await readRetired()).length)
  ipcMain.handle('share:destroyRetired', async () => destroyRetiredKeys())

  ipcMain.handle('share:myFingerprint', async () => {
    try {
      return (await getIdentity()).pub.fingerprint
    } catch (err) {
      if (err instanceof IdentityUnavailable) return null
      throw err
    }
  })

  // Export one saved diff as a sealed file addressed to one recipient or several.
  // entry: { name, createdAt, expiresAt, snapshot }
  ipcMain.handle(
    'share:export',
    guardIdentity(async (e, entry, recipientFps) => {
      const wanted = [...new Set(Array.isArray(recipientFps) ? recipientFps : [recipientFps])]
      const trusted = await readTrusted()
      const recipients = wanted.map((fp) => trusted.find((t) => t.fingerprint === fp))
      if (!recipients.length || recipients.some((r) => !r)) return { error: 'unknown-recipient' }

      // Enforce the TTL at signing too — never sign timestamps a receiver rejects.
      const invalid = ttlError(entry)
      if (invalid) return { error: invalid }

      const { priv, pub } = await getIdentity()
      const file = sealEntry(entry, { priv, fingerprint: pub.fingerprint }, recipients)
      // Filename is forced (a ciphertext hash); the user only picks WHERE.
      const forcedName = shareFilename(file)
      const { canceled, filePath } = await dialog.showSaveDialog({
        title:
          recipients.length > 1
            ? `Share diff (sealed for ${recipients.length} recipients)`
            : 'Share diff (sealed for one recipient)',
        defaultPath: forcedName,
        filters: [{ name: 'Diff Bro shared diff', extensions: ['diffbro'] }]
      })
      if (canceled || !filePath) return { canceled: true }

      const outPath = join(dirname(filePath), forcedName)
      await writeFile(outPath, JSON.stringify(file, null, 2))
      return { ok: true, path: outPath, to: recipients.map((r) => r.label).join(', ') }
    })
  )

  ipcMain.handle(
    'share:import',
    guardIdentity(async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import shared diff',
        properties: ['openFile'],
        filters: [{ name: 'Diff Bro shared diff', extensions: ['diffbro'] }]
      })
      if (canceled || !filePaths.length) return { canceled: true }
      return openSharedFileAt(filePaths[0])
    })
  )

  // Drag-drop variant — same untrusted-file guards as the dialog path.
  ipcMain.handle(
    'share:importPath',
    guardIdentity((e, path) => openSharedFileAt(path))
  )

  // This install's current key display label (what recipients see on import).
  ipcMain.handle('share:myLabel', async () => {
    try {
      return cleanLabel((await getIdentity()).pub.label)
    } catch (err) {
      if (err instanceof IdentityUnavailable) return ''
      throw err
    }
  })

  // Save this install's public key for handoff; `label` is the embedded cosmetic
  // display name.
  ipcMain.handle(
    'share:exportPublicKey',
    guardIdentity(async (e, label) => {
      const pub = await pubWithLabel(label)
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export my public key',
        defaultPath: keyFileBasename(cleanLabel(pub.label), pub.fingerprint),
        filters: [{ name: 'Diff Bro public key', extensions: ['diffbrokey'] }]
      })
      if (canceled || !filePath) return { canceled: true }
      await writeFile(filePath, encodePublicKey(pub))
      return { ok: true, path: filePath, fingerprint: pub.fingerprint }
    })
  )

  // Same public-key payload as the export file, to the clipboard. Private key
  // never leaves this process (rule 4).
  ipcMain.handle(
    'share:copyPublicKey',
    guardIdentity(async (e, label) => {
      const pub = await pubWithLabel(label)
      clipboard.writeText(encodePublicKey(pub))
      return { ok: true, fingerprint: pub.fingerprint }
    })
  )

  // Validate a peer's key but DON'T store it — the renderer names it first, then
  // commits via share:addTrustedKeyNamed.
  ipcMain.handle(
    'share:addTrustedKey',
    guardIdentity(async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Add trusted public key',
        properties: ['openFile'],
        filters: [{ name: 'Diff Bro public key', extensions: ['diffbrokey'] }]
      })
      if (canceled || !filePaths.length) return { canceled: true }

      let parsed
      try {
        parsed = await parseKeyFileAt(filePaths[0])
      } catch {
        return { error: 'not-a-key' }
      }
      if (parsed.fp === (await getIdentity()).pub.fingerprint) return { error: 'own-key' }
      return {
        ok: true,
        key: parsed.key,
        fingerprint: parsed.fp,
        defaultLabel: parsed.defaultLabel,
        vouchedBy: await vouchedBy(parsed.key)
      }
    })
  )

  // List, rename and remove trusted keys for the management UI.
  ipcMain.handle('share:renameTrusted', async (e, fp, label) => {
    const trusted = await readTrusted()
    const entry = trusted.find((t) => t.fingerprint === fp)
    if (!entry) return { error: 'unknown' }
    entry.label = (label || fp).trim() || fp
    await writeFile(trustPath(), JSON.stringify(trusted, null, 2))
    return { ok: true, label: entry.label, fingerprint: fp }
  })

  ipcMain.handle('share:removeTrusted', async (e, fp) => {
    const trusted = (await readTrusted()).filter((t) => t.fingerprint !== fp)
    await writeFile(trustPath(), JSON.stringify(trusted, null, 2))
    return { ok: true }
  })

  // Read + validate a dragged-in .diffbrokey by path WITHOUT storing it, so
  // the renderer can prompt for a name first. Public key material only.
  ipcMain.handle(
    'share:readKeyFile',
    guardIdentity(async (e, path) => {
      let parsed
      try {
        parsed = await parseKeyFileAt(path)
      } catch {
        return { error: 'not-a-key' }
      }
      // You can't (and needn't) trust your own key.
      if (parsed.fp === (await getIdentity()).pub.fingerprint) return { error: 'own-key' }
      return {
        ok: true,
        key: parsed.key,
        fingerprint: parsed.fp,
        defaultLabel: parsed.defaultLabel,
        vouchedBy: await vouchedBy(parsed.key)
      }
    })
  )

  /**
   * The label of an ALREADY-TRUSTED key that signed this one's rotation record —
   * or null. The predecessor's signing key is read from the trust store, never
   * from the file, or the record would be vouching for itself.
   *
   * Advisory by construction: whoever holds a leaked private key can sign a
   * rotation to a key of their own, so this downgrades the out-of-band check and
   * never replaces it. The UI must say WHICH key vouched.
   * @param {object} key
   * @returns {Promise<string|null>}
   */
  async function vouchedBy(key) {
    const record = key?.rotation
    if (!record?.from) return null
    const previous = (await readTrusted()).find((t) => t.fingerprint === record.from)
    if (!previous?.sign) return null
    return verifyRotation(record, previous.sign, key) ? previous.label || record.from : null
  }

  // Fingerprint recomputed from the key material — the renderer's is never trusted.
  ipcMain.handle(
    'share:addTrustedKeyNamed',
    guardIdentity(async (e, key, label) => {
      if (!isAcceptedKeyFormat(key?.format) || !key.sign || !key.box) return { error: 'not-a-key' }
      const fp = fingerprint(key.sign, key.box)
      if (fp === (await getIdentity()).pub.fingerprint) return { error: 'own-key' }
      const vouch = await vouchedBy(key)
      await storeTrusted(key, fp, label)
      return { ok: true, label: (label || fp).trim() || fp, fingerprint: fp, vouchedBy: vouch }
    })
  )

  // Config backup: identity keypair + trusted keys + snippets + settings. The
  // private key only leaves this process inside the passphrase-encrypted blob
  // (rule 4). Diffs are excluded (ephemeral).
  ipcMain.handle(
    'config:backup',
    guardIdentity(async (e, snippets, settings, passphrase) => {
      if (typeof passphrase !== 'string' || !passphrase) return { error: 'bad-request' }
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Back up configuration',
        defaultPath: 'diffbro-config-backup.diffbroconf',
        filters: [{ name: 'Diff Bro configuration', extensions: ['diffbroconf'] }]
      })
      if (canceled || !filePath) return { canceled: true }

      const identity = await getIdentity()
      const trusted = await readTrusted()
      const blob = await sealConfig({ identity, trusted, snippets, settings }, passphrase)
      await writeFile(filePath, blob)
      return { ok: true, path: filePath }
    })
  )

  ipcMain.handle('config:restore', async (e, passphrase) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restore configuration',
      properties: ['openFile'],
      filters: [{ name: 'Diff Bro configuration', extensions: ['diffbroconf'] }]
    })
    if (canceled || !filePaths.length) return { canceled: true }

    const blob = await readConfigFile(filePaths[0])
    if (blob == null) return { error: 'not-a-config-file' }

    const res = await openConfig(blob, passphrase)
    if (!res.ok) return { error: res.error }
    return applyRestoredConfig(res.bundle)
  })
}

// Size-capped read; null on anything unreadable or oversized.
async function readConfigFile(path) {
  try {
    const { size } = await stat(path)
    if (size > MAX_SHARE_FILE_BYTES) return null
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

// A decryptable backup is still validated (same checks as a snippet import)
// before anything is applied.
async function applyRestoredConfig({ identity, trusted, snippets, settings }) {
  if (snippets != null && validateSnippetBundle(snippets)) return { error: 'malformed' }
  if (identity?.priv && identity?.pub) await persistIdentity(identity.priv, identity.pub)
  if (Array.isArray(trusted)) await writeFile(trustPath(), JSON.stringify(trusted, null, 2))
  // Snippets + settings go back to the renderer to re-encrypt locally.
  return { ok: true, snippets: snippets ?? null, settings: settings ?? null }
}
