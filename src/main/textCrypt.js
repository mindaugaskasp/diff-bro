// Pure crypto core for the Tools → Encrypt/Decrypt Text dialog — a local,
// passphrase-based scratch tool (not related to the vault or share crypto).
// No Electron imports, unit-tested; index.js owns the thin IPC handlers.
//
// Output is a single self-describing base64 blob: the passphrase is run
// through scrypt with a random salt (embedded in the blob) to derive the
// cipher key, so decrypting only ever needs the same passphrase — the
// algorithm and salt travel with the ciphertext.
//
// AES-256-GCM only, deliberately. An unauthenticated mode (e.g. CBC) has no
// MAC: its ciphertext is malleable and a tampered blob can decrypt
// "successfully" to attacker-influenced garbage, which is a footgun for a tool
// people reach for precisely when integrity matters. The `ALGORITHMS`
// allowlist also means any blob written by an older build with a different
// algorithm is simply refused rather than decrypted without authentication.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { SCRYPT_PARAMS, deriveKey, scryptParamsFor } from './kdf'

export const TEXT_CRYPT_FORMAT = 'diffbro-textcrypt/1'
export const ALGORITHMS = ['aes-256-gcm']

const GCM_IV_BYTES = 12

export async function encryptText(plaintext, passphrase, algorithm = 'aes-256-gcm') {
  if (!ALGORITHMS.includes(algorithm)) throw new Error(`Unsupported algorithm: ${algorithm}`)

  const salt = randomBytes(16)
  const key = await deriveKey(passphrase, salt)
  const iv = randomBytes(GCM_IV_BYTES)
  const cipher = createCipheriv(algorithm, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  const envelope = {
    format: TEXT_CRYPT_FORMAT,
    algo: algorithm,
    kdf: SCRYPT_PARAMS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  }
  return Buffer.from(JSON.stringify(envelope)).toString('base64')
}

// The envelope's shape, checked before any key derivation runs on it.
// `params === null` means the kdf field itself was malformed.
function hasEnvelopeShape(envelope, params) {
  return (
    envelope?.format === TEXT_CRYPT_FORMAT &&
    ALGORITHMS.includes(envelope.algo) &&
    typeof envelope.salt === 'string' &&
    typeof envelope.iv === 'string' &&
    typeof envelope.ciphertext === 'string' &&
    typeof envelope.tag === 'string' &&
    params !== null
  )
}

// Returns { ok: true, plaintext } or { ok: false, error }. Never distinguishes
// "wrong passphrase" from "corrupted data" from "not a blob we made" — all
// collapse to the same generic failure, same as vaultDecrypt.
export async function decryptText(blob, passphrase) {
  let envelope
  try {
    envelope = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'))
  } catch {
    return { ok: false, error: 'Not a valid encrypted blob.' }
  }
  const params = scryptParamsFor(envelope)
  if (!hasEnvelopeShape(envelope, params)) {
    return { ok: false, error: 'Not a valid encrypted blob.' }
  }

  try {
    const salt = Buffer.from(envelope.salt, 'base64')
    const key = await deriveKey(passphrase, salt, params)
    const decipher = createDecipheriv(envelope.algo, key, Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8')
    return { ok: true, plaintext }
  } catch {
    return { ok: false, error: 'Wrong passphrase, or the data is corrupted.' }
  }
}
