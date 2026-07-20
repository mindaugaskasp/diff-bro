// Shared passphrase key-derivation for the passphrase-based formats
// (textCrypt, snippetSealing, configBackup). No Electron imports, unit-tested.
//
// Three things this centralizes:
//   1. Explicit, pinned scrypt cost — N=2^17 (~128 MiB working set at r=8),
//      well above Node's default N=2^14, which is light for files meant to
//      persist indefinitely. Node throws at this N unless `maxmem` is raised,
//      so we pass it explicitly.
//   2. Async derivation — `scryptSync` blocks the main process's event loop
//      (freezing every window for the ~hundreds of ms a derivation takes), so
//      we use the async form.
//   3. Backward/forward compatibility — the parameters travel in the envelope
//      (`kdf`), so a file written with one cost still opens after the pin
//      changes. Files written before params were embedded carry no `kdf`
//      field and are read with Node's old defaults (`LEGACY_PARAMS`).
import { scrypt as scryptCb } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCb)

export const SCRYPT_KEYLEN = 32
// Pinned cost for everything written from here on.
export const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1 }
// Node's historical defaults — what pre-`kdf` files were derived with.
const LEGACY_PARAMS = { N: 2 ** 14, r: 8, p: 1 }
// Cap so a hostile envelope can't request an unbounded working set. 128*N*r
// bytes is the scrypt working memory; this covers the pinned N=2^17 with room.
const MAXMEM = 256 * 1024 * 1024
const MAX_N = 2 ** 20

const isPow2 = (n) => Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0

// Resolve the scrypt parameters to use when OPENING an envelope. Returns the
// legacy defaults when no `kdf` is present (older file), the validated params
// when present, or null when the `kdf` field is malformed/out of bounds (so
// the caller can reject the file rather than derive with attacker-chosen cost).
export function scryptParamsFor(envelope) {
  const k = envelope?.kdf
  if (k == null) return LEGACY_PARAMS
  if (typeof k !== 'object') return null
  const { N, r, p } = k
  if (!isPow2(N) || N > MAX_N) return null
  if (!Number.isInteger(r) || r < 1 || r > 16) return null
  if (!Number.isInteger(p) || p < 1 || p > 4) return null
  if (128 * N * r > MAXMEM) return null
  return { N, r, p }
}

// Derive a key. `params` defaults to the pinned cost (for sealing); pass the
// result of scryptParamsFor when opening an existing envelope.
export async function deriveKey(passphrase, salt, params = SCRYPT_PARAMS) {
  return scrypt(passphrase, salt, SCRYPT_KEYLEN, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: MAXMEM
  })
}
