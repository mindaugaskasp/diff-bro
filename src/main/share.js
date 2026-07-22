// Secure diff sharing — Electron glue (dialogs, key persistence, IPC).
// All actual crypto lives in sealing.js, which is pure and unit-tested.
//
// Every install has two keypairs (generated on first use, private halves
// wrapped by the OS keychain via safeStorage). Peers exchange .diffbrokey
// files (public halves only) out of band and import them via "Add Trusted
// Key" — the exchange must happen in BOTH directions before sharing works,
// because a share file is addressed to one specific recipient.
import { clipboard, dialog, ipcMain, safeStorage } from 'electron'
import { readFile, stat, writeFile } from 'fs/promises'
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
  openSealed,
  sealEntry,
  shareFilename,
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

// The identity files exist but can't be loaded right now (locked keychain,
// DPAPI error after a profile move, corruption). Minting a fresh identity here
// would silently rotate this install's public key — every peer's trust would
// break with no signal to either side — so we surface this instead and never
// overwrite the existing files.
class IdentityUnavailable extends Error {
  constructor() {
    super('identity-unavailable')
    this.name = 'IdentityUnavailable'
  }
}

export async function getIdentity() {
  // Read both halves without letting one missing file mask the other's state.
  const [privRes, pubRes] = await Promise.allSettled([
    readFile(privPath()),
    readFile(pubPath(), 'utf-8')
  ])
  const missing = (r) => r.status === 'rejected' && r.reason?.code === 'ENOENT'

  // Only a truly absent identity (BOTH halves missing) is "first run". A
  // partial or unreadable state must never trigger regeneration, or we'd
  // overwrite a recoverable key.
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

// Unwrap the stored keypair. Anything unreadable is surfaced, never
// regenerated — regenerating would discard a recoverable key.
function decodeIdentity(rawPriv, rawPub) {
  try {
    const isPlain = rawPriv.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX
    // A plaintext identity key while the keychain works is anomalous (we always
    // wrap when we can) — treat it as planted and refuse, rather than adopting
    // an attacker-supplied private key as this install's identity.
    if (isPlain && safeStorage.isEncryptionAvailable()) throw new IdentityUnavailable()
    const privJson = isPlain
      ? rawPriv.subarray(PLAIN_PREFIX.length).toString()
      : safeStorage.decryptString(rawPriv)
    return { priv: JSON.parse(privJson), pub: JSON.parse(rawPub) }
  } catch {
    throw new IdentityUnavailable()
  }
}

// Upgrade an identity written by an older release (e.g. diffbro-key/1 with a
// 64-bit fingerprint) to the current format and 128-bit fingerprint, keeping the
// SAME key material. Without this, this install would keep exporting and sealing
// under the old format — which current peers reject — so a key it exports can't
// even be re-imported. Runs once: the next load already matches.
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

// Write the identity keypair, private half wrapped by the OS keychain
// (safeStorage) where available. Shared by first-run generation and restore.
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

// Set/refresh this install's public-key display label and return the pub with
// it embedded. Persisted on identity.pub so it sticks across exports. The label
// is cosmetic only — it is never part of the fingerprint or any trust check.
async function pubWithLabel(rawLabel) {
  const { priv, pub } = await getIdentity()
  // undefined/null means "keep whatever label is already set" (callers that
  // don't manage the label, e.g. the share dialog). A string — even '' — is an
  // explicit set from the Share-my-key dialog.
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

// Read + validate a .diffbrokey file at `path`. Returns the public key
// material, a recomputed fingerprint (never trust the stated one), and a
// default label from the filename. Throws on anything malformed/oversized.
async function parseKeyFileAt(path) {
  const { size } = await stat(path)
  if (size > MAX_KEY_FILE_BYTES) throw new Error('too large')
  const key = decodePublicKey(await readFile(path, 'utf-8'))
  if (!isAcceptedKeyFormat(key.format) || !key.sign || !key.box) throw new Error('bad format')
  // Prefer the sender's self-chosen label (a cosmetic hint, sanitized and
  // never trusted) so the recipient sees a human name; fall back to the
  // filename. This is what makes "whose key is this?" answerable at a glance.
  const embedded = cleanLabel(key.label)
  return {
    // Normalize to the current format — the material is what matters, and the
    // fingerprint below is recomputed at 128 bits regardless of the file's age.
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

// Wrap a handler so an unloadable identity surfaces as a plain error object
// the renderer can render, instead of a rejected IPC promise (which would
// throw in the renderer). Handlers that don't touch the identity are left bare.
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

export function registerShareIpc() {
  ipcMain.handle('share:listTrusted', async () => {
    return (await readTrusted()).map(({ fingerprint: fp, label }) => ({ fingerprint: fp, label }))
  })

  // Fingerprint of this install's own identity. Calling this creates the
  // keypairs on first use, so the share dialog can onboard a fresh install
  // without any manual "generate keys" step. null if the identity can't be
  // loaded (the dialog just shows no fingerprint rather than crashing).
  ipcMain.handle('share:myFingerprint', async () => {
    try {
      return (await getIdentity()).pub.fingerprint
    } catch (err) {
      if (err instanceof IdentityUnavailable) return null
      throw err
    }
  })

  // Export one saved diff as a sealed file addressed to `recipientFp`.
  // entry: { name, createdAt, expiresAt, snapshot }
  ipcMain.handle(
    'share:export',
    guardIdentity(async (e, entry, recipientFp) => {
      const recipient = (await readTrusted()).find((t) => t.fingerprint === recipientFp)
      if (!recipient) return { error: 'unknown-recipient' }

      // Enforce the TTL rules at signing time too — never put our signature
      // on timestamps a receiver would have to reject.
      const invalid = ttlError(entry)
      if (invalid) return { error: invalid }

      const { priv, pub } = await getIdentity()
      const file = sealEntry(entry, { priv, fingerprint: pub.fingerprint }, recipient)
      // The filename is a hash of the ciphertext (hides the diff's name/size
      // signature; import rejects a renamed file), so we only let the user pick
      // WHERE to save — the basename is forced.
      const forcedName = shareFilename(file)
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Share diff (sealed for one recipient)',
        defaultPath: forcedName,
        filters: [{ name: 'Diff Bro shared diff', extensions: ['diffbro'] }]
      })
      if (canceled || !filePath) return { canceled: true }

      const outPath = join(dirname(filePath), forcedName)
      await writeFile(outPath, JSON.stringify(file, null, 2))
      return { ok: true, path: outPath, to: recipient.label }
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

      let file
      try {
        const { size } = await stat(filePaths[0])
        if (size > MAX_SHARE_FILE_BYTES) return { error: 'not-a-share-file' }
        file = JSON.parse(await readFile(filePaths[0], 'utf-8'))
      } catch {
        return { error: 'not-a-share-file' }
      }

      // Integrity is tied to the filename: a shared diff must keep the hashed
      // name it was written with. A renamed file is refused.
      if (file?.ciphertext && basename(filePaths[0]) !== shareFilename(file)) {
        return { error: 'renamed' }
      }

      return openSealed(file, await getIdentity(), await readTrusted())
    })
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

  // Save this install's public key so it can be handed to other machines. The
  // `label` is the sender's self-chosen display name: it's embedded in the file
  // (a cosmetic hint) so the recipient sees a human name instead of a hex
  // fingerprint, drives a recognizable filename, and is persisted so it sticks.
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

  // Same payload as the .diffbrokey file, on the clipboard instead of on disk,
  // so it can be pasted straight into a password manager or chat. Public
  // halves only — this is the same data the export dialog writes, and the
  // private key still never leaves this process (CLAUDE.md rule 4).
  // clipboard.writeText behaves identically on Windows, macOS and Linux.
  ipcMain.handle(
    'share:copyPublicKey',
    guardIdentity(async (e, label) => {
      const pub = await pubWithLabel(label)
      clipboard.writeText(encodePublicKey(pub))
      return { ok: true, fingerprint: pub.fingerprint }
    })
  )

  // Pick a peer's public-key file and validate it, but DON'T store it yet —
  // the renderer prompts for a name first (a trusted host must always be
  // named), then commits via share:addTrustedKeyNamed. Public key only.
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
        defaultLabel: parsed.defaultLabel
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
        defaultLabel: parsed.defaultLabel
      }
    })
  )

  // Commit a trusted key the user reviewed/named in the drag-drop dialog.
  // The fingerprint is recomputed from the key material — the renderer's is
  // never trusted.
  ipcMain.handle(
    'share:addTrustedKeyNamed',
    guardIdentity(async (e, key, label) => {
      if (!isAcceptedKeyFormat(key?.format) || !key.sign || !key.box) return { error: 'not-a-key' }
      const fp = fingerprint(key.sign, key.box)
      if (fp === (await getIdentity()).pub.fingerprint) return { error: 'own-key' }
      await storeTrusted(key, fp, label)
      return { ok: true, label: (label || fp).trim() || fp, fingerprint: fp }
    })
  )

  // --- Configuration backup / restore (passphrase-encrypted) ---
  // Bundles this install's identity keypair, the trusted-keys list, the
  // snippet library (passed in decrypted by the renderer) and UI settings.
  // The private identity key is read and written HERE and only ever leaves
  // this process inside the passphrase-encrypted blob (CLAUDE.md rule 4).
  // Diffs are deliberately excluded — they are ephemeral and auto-expiring.
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

// Size-capped read of a chosen backup file. null on anything unreadable or
// oversized — the caller turns that into a user-facing rejection.
async function readConfigFile(path) {
  try {
    const { size } = await stat(path)
    if (size > MAX_SHARE_FILE_BYTES) return null
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

// A decryptable backup is still validated before anything is applied — the
// snippet bundle gets the same shape/size checks as a snippet import, so a
// malformed-but-decryptable config can't half-write state or blow the quota.
async function applyRestoredConfig({ identity, trusted, snippets, settings }) {
  if (snippets != null && validateSnippetBundle(snippets)) return { error: 'malformed' }
  if (identity?.priv && identity?.pub) await persistIdentity(identity.priv, identity.pub)
  if (Array.isArray(trusted)) await writeFile(trustPath(), JSON.stringify(trusted, null, 2))
  // Snippets + settings go back to the renderer to re-import locally
  // (re-encrypted under this machine's vault key).
  return { ok: true, snippets: snippets ?? null, settings: settings ?? null }
}
