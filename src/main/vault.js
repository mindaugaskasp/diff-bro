import { app, ipcMain, safeStorage } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { randomBytes } from 'crypto'
import { join } from 'path'
import { vaultDecrypt, vaultEncrypt } from './vaultCrypt'

// ---------------------------------------------------------------------------
// Saved-diff vault. Saved diffs live in the renderer's localStorage as
// AES-256-GCM ciphertext, but all crypto happens HERE: the renderer only
// ever sees `vault:encrypt` / `vault:decrypt` — the key itself never
// crosses the IPC boundary, so a compromised renderer cannot exfiltrate it
// (CLAUDE.md rule 4).
// The 256-bit key is generated once per install and protected at rest by
// the OS keychain via safeStorage (DPAPI on Windows, Keychain on macOS,
// libsecret on Linux). Where no keychain exists (e.g. the Docker test
// container) the key file is stored as-is — the entries are still
// encrypted, the key just has no OS-level protection.
// ---------------------------------------------------------------------------
const PLAIN_PREFIX = 'plain:'

// Distinct from a genuine per-entry auth failure: the key itself couldn't be
// loaded (locked keychain, DPAPI error after a profile move, a transient FS
// error, a corrupted-but-recoverable file). This must NOT be treated as
// "missing", because regenerating the key would strand every saved diff and
// snippet forever — so we surface it and leave the existing key file untouched.
class VaultKeyUnavailable extends Error {
  constructor() {
    super('vault-key-unavailable')
    this.name = 'VaultKeyUnavailable'
  }
}

let vaultKeyPromise = null

function getVaultKey() {
  // Never cache a rejection: if the keychain was merely locked, a later call
  // (after the user unlocks it) must be able to succeed.
  vaultKeyPromise ??= loadVaultKey().catch((err) => {
    vaultKeyPromise = null
    throw err
  })
  return vaultKeyPromise
}

async function generateVaultKey(keyPath) {
  const key = randomBytes(32).toString('base64')
  const out = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key)
    : Buffer.from(PLAIN_PREFIX + key)
  await writeFile(keyPath, out, { mode: 0o600 })
  return Buffer.from(key, 'base64')
}

async function loadVaultKey() {
  const keyPath = join(app.getPath('userData'), 'vault.key')
  let raw
  try {
    raw = await readFile(keyPath)
  } catch (err) {
    // Only a genuinely absent file means "first run, generate a key". Any
    // other read error (permissions, locked, transient) must not overwrite it.
    if (err.code === 'ENOENT') return generateVaultKey(keyPath)
    throw new VaultKeyUnavailable()
  }
  const isPlain = raw.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX
  if (isPlain) {
    // A plaintext key file only ever exists where no OS keychain is available
    // (e.g. the Docker test env). If the keychain works here, we would have
    // wrapped the key — so a plaintext file is anomalous: either migrated from
    // a keychain-less machine or PLANTED by a local attacker who can write to
    // userData. We can't tell them apart, and adopting it would silently use
    // an attacker-known key, so refuse rather than trust it.
    if (safeStorage.isEncryptionAvailable()) throw new VaultKeyUnavailable()
    return Buffer.from(raw.subarray(PLAIN_PREFIX.length).toString(), 'base64')
  }
  try {
    return Buffer.from(safeStorage.decryptString(raw), 'base64')
  } catch {
    // Present but undecryptable: never overwrite it — that would permanently
    // destroy the key (and every entry it protects). Surface instead.
    throw new VaultKeyUnavailable()
  }
}

// Map a key-load failure to a distinct sentinel the renderer can tell apart
// from a per-entry auth failure, so it warns instead of purging every entry.
async function withKey(fn) {
  try {
    return await fn(await getVaultKey())
  } catch (err) {
    if (err instanceof VaultKeyUnavailable) return { error: 'vault-key-unavailable' }
    throw err
  }
}

export function registerVaultIpc() {
  // plaintext/aad are strings; result mirrors what the renderer stores, or
  // { error: 'vault-key-unavailable' } if the key couldn't be loaded.
  ipcMain.handle('vault:encrypt', async (e, plaintext, aad) => {
    // Guard the shapes a compromised renderer could send before they hit the
    // crypto core. A non-null error object (not null) means the renderer will
    // surface, never purge (CLAUDE.md rule 6).
    if (typeof plaintext !== 'string' || typeof aad !== 'string') return { error: 'bad-request' }
    return withKey((key) => vaultEncrypt(key, plaintext, aad))
  })

  // The plaintext string on success; null when the ENTRY fails authentication
  // (tampered metadata, wrong key) — the renderer purges those. A
  // { error: ... } object instead means the request/key was bad, not the
  // entry: the renderer must keep the entries and warn, never purge.
  ipcMain.handle('vault:decrypt', async (e, box, aad) => {
    if (
      !box ||
      typeof box.iv !== 'string' ||
      typeof box.data !== 'string' ||
      typeof aad !== 'string'
    )
      return { error: 'bad-request' }
    return withKey((key) => vaultDecrypt(key, box, aad))
  })
}
