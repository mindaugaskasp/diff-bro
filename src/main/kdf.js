// Shared passphrase key-derivation (textCrypt, snippetSealing, configBackup).
// Pinned scrypt cost N=2^17 (well above Node's default), async so it doesn't
// freeze the event loop, and the params travel in the envelope (`kdf`) so a
// file still opens after the pin changes.
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

// Bounds an attacker-supplied cost must satisfy, so a hostile envelope can't
// request an unbounded working set.
function withinScryptBounds({ N, r, p }) {
  if (!isPow2(N) || N > MAX_N) return false
  if (!Number.isInteger(r) || r < 1 || r > 16) return false
  if (!Number.isInteger(p) || p < 1 || p > 4) return false
  return 128 * N * r <= MAXMEM
}

// null on a malformed/out-of-bounds `kdf` so the caller rejects the file rather
// than deriving with an attacker-chosen cost.
export function scryptParamsFor(envelope) {
  const k = envelope?.kdf
  if (k == null) return LEGACY_PARAMS
  if (typeof k !== 'object') return null
  const { N, r, p } = k
  return withinScryptBounds({ N, r, p }) ? { N, r, p } : null
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
