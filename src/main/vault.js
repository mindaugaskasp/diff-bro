import { ipcMain, safeStorage } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { randomBytes } from 'crypto'
import { dataFile } from './appData'
import { vaultDecrypt, vaultEncrypt } from './vaultCrypt'

// Saved-diff vault. All crypto happens HERE — the renderer only sees
// vault:encrypt/decrypt, the key never crosses the IPC boundary (rule 4). The
// 256-bit key is protected at rest by the OS keychain (safeStorage), or stored
// as-is where none exists (e.g. the Docker container).
const PLAIN_PREFIX = 'plain:'

// The key itself couldn't be loaded (locked keychain, corruption) — distinct
// from a per-entry auth failure. Never treat as "missing": regenerating would
// strand every saved diff and snippet.
class VaultKeyUnavailable extends Error {
  constructor() {
    super('vault-key-unavailable')
    this.name = 'VaultKeyUnavailable'
  }
}

let vaultKeyPromise = null

function getVaultKey() {
  // Never cache a rejection, so a later call after the keychain unlocks succeeds.
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
  const keyPath = dataFile('vault.key')
  let raw
  try {
    raw = await readFile(keyPath)
  } catch (err) {
    // Only a genuinely absent file is "first run"; any other read error must
    // not overwrite it.
    if (err.code === 'ENOENT') return generateVaultKey(keyPath)
    throw new VaultKeyUnavailable()
  }
  const isPlain = raw.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX
  if (isPlain) {
    // A plaintext key while the keychain works is anomalous (migrated or
    // PLANTED) — refuse rather than adopt an attacker-known key.
    if (safeStorage.isEncryptionAvailable()) throw new VaultKeyUnavailable()
    return Buffer.from(raw.subarray(PLAIN_PREFIX.length).toString(), 'base64')
  }
  try {
    return Buffer.from(safeStorage.decryptString(raw), 'base64')
  } catch {
    // Present but undecryptable: surface, never overwrite (that destroys the key).
    throw new VaultKeyUnavailable()
  }
}

// Distinct sentinel so the renderer warns instead of purging every entry.
async function withKey(fn) {
  try {
    return await fn(await getVaultKey())
  } catch (err) {
    if (err instanceof VaultKeyUnavailable) return { error: 'vault-key-unavailable' }
    throw err
  }
}

export function registerVaultIpc() {
  ipcMain.handle('vault:encrypt', async (e, plaintext, aad) => {
    // Guard the shapes a compromised renderer could send (rule 6).
    if (typeof plaintext !== 'string' || typeof aad !== 'string') return { error: 'bad-request' }
    return withKey((key) => vaultEncrypt(key, plaintext, aad))
  })

  // null means the ENTRY failed auth (renderer purges it); an { error } object
  // means the request/key was bad (renderer keeps entries and warns).
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
