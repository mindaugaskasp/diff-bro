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

let vaultKeyPromise = null

function getVaultKey() {
  vaultKeyPromise ??= (async () => {
    const keyPath = join(app.getPath('userData'), 'vault.key')
    try {
      const raw = await readFile(keyPath)
      if (raw.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX) {
        return Buffer.from(raw.subarray(PLAIN_PREFIX.length).toString(), 'base64')
      }
      return Buffer.from(safeStorage.decryptString(raw), 'base64')
    } catch {
      // Missing or undecryptable key file: start a fresh key. Old entries
      // become unreadable and are purged by the renderer on decrypt failure.
      const key = randomBytes(32).toString('base64')
      const out = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(key)
        : Buffer.from(PLAIN_PREFIX + key)
      await writeFile(keyPath, out, { mode: 0o600 })
      return Buffer.from(key, 'base64')
    }
  })()
  return vaultKeyPromise
}

export function registerVaultIpc() {
  // plaintext/aad are strings; result mirrors what the renderer stores.
  ipcMain.handle('vault:encrypt', async (e, plaintext, aad) =>
    vaultEncrypt(await getVaultKey(), plaintext, aad)
  )

  // null when the entry fails authentication (tampered metadata, rotated key).
  ipcMain.handle('vault:decrypt', async (e, box, aad) =>
    vaultDecrypt(await getVaultKey(), box, aad)
  )
}
