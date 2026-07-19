// Pure crypto core for the Tools → Encrypt/Decrypt Text dialog — a local,
// passphrase-based scratch tool (not related to the vault or share crypto).
// No Electron imports, unit-tested; index.js owns the thin IPC handlers.
//
// Output is a single self-describing base64 blob: the passphrase is run
// through scrypt with a random salt (embedded in the blob) to derive the
// cipher key, so decrypting only ever needs the same passphrase — the
// algorithm and salt travel with the ciphertext. Only two algorithms are
// offered, both AES with a random IV; no ECB/DES/RC4-class options.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

export const TEXT_CRYPT_FORMAT = 'diffbro-textcrypt/1'
export const ALGORITHMS = ['aes-256-gcm', 'aes-256-cbc']

const SCRYPT_KEYLEN = 32
const GCM_IV_BYTES = 12
const CBC_IV_BYTES = 16

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, SCRYPT_KEYLEN)
}

export function encryptText(plaintext, passphrase, algorithm) {
  if (!ALGORITHMS.includes(algorithm)) throw new Error(`Unsupported algorithm: ${algorithm}`)

  const salt = randomBytes(16)
  const key = deriveKey(passphrase, salt)
  const iv = randomBytes(algorithm === 'aes-256-gcm' ? GCM_IV_BYTES : CBC_IV_BYTES)
  const cipher = createCipheriv(algorithm, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  const envelope = {
    format: TEXT_CRYPT_FORMAT,
    algo: algorithm,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    ...(algorithm === 'aes-256-gcm' ? { tag: cipher.getAuthTag().toString('base64') } : {})
  }
  return Buffer.from(JSON.stringify(envelope)).toString('base64')
}

// Returns { ok: true, plaintext } or { ok: false, error }. Never distinguishes
// "wrong passphrase" from "corrupted data" from "not a blob we made" — all
// collapse to the same generic failure, same as vaultDecrypt.
export function decryptText(blob, passphrase) {
  let envelope
  try {
    envelope = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'))
  } catch {
    return { ok: false, error: 'Not a valid encrypted blob.' }
  }
  if (
    envelope?.format !== TEXT_CRYPT_FORMAT ||
    !ALGORITHMS.includes(envelope.algo) ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    return { ok: false, error: 'Not a valid encrypted blob.' }
  }
  if (envelope.algo === 'aes-256-gcm' && typeof envelope.tag !== 'string') {
    return { ok: false, error: 'Not a valid encrypted blob.' }
  }

  try {
    const salt = Buffer.from(envelope.salt, 'base64')
    const key = deriveKey(passphrase, salt)
    const decipher = createDecipheriv(envelope.algo, key, Buffer.from(envelope.iv, 'base64'))
    if (envelope.algo === 'aes-256-gcm') {
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    }
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8')
    return { ok: true, plaintext }
  } catch {
    return { ok: false, error: 'Wrong passphrase, or the data is corrupted.' }
  }
}
