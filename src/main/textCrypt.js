// Pure crypto for the Tools → Encrypt/Decrypt Text dialog (local passphrase
// scratch tool). Self-describing base64 blob: scrypt-derived key, algo + salt
// embedded. Authenticated (AES-256-GCM) ONLY — the ALGORITHMS allowlist refuses
// anything else rather than decrypt an unauthenticated, malleable blob.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { SCRYPT_PARAMS, deriveKey, scryptParamsFor } from './kdf'

export const TEXT_CRYPT_FORMAT = 'diffbro-textcrypt/1'
export const ALGORITHMS = ['aes-256-gcm']
// Decrypt-only interop for payloads encrypted elsewhere. CBC is UNAUTHENTICATED,
// so we never ENCRYPT with it (that would hand out a malleable blob) — the
// allowlist here gates decryption only.
export const RAW_DECRYPT_ALGORITHMS = ['aes-256-cbc']

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

// Failures never distinguish wrong-passphrase from corrupt from not-ours.
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

// Hex (even-length, hex charset) or base64 → bytes; null when neither yields any.
function parseKeyMaterial(text) {
  const s = String(text ?? '').trim()
  if (!s) return null
  if (/^[0-9a-f]+$/i.test(s) && s.length % 2 === 0) return Buffer.from(s, 'hex')
  const bytes = Buffer.from(s.replace(/\s+/g, ''), 'base64')
  return bytes.length ? bytes : null
}

// Decrypt an externally-encrypted payload with a raw key + IV — no passphrase, no
// KDF. UNAUTHENTICATED: a successful decrypt does NOT prove the ciphertext is
// intact (the UI says so). The raw key is user-supplied input to this op, not
// app-managed key material, so it crosses IPC like the passphrase does.
// Parse + length-check the three inputs; { error } or the three byte buffers.
function parseCbcInputs({ ciphertext, key, iv }) {
  const keyBuf = parseKeyMaterial(key)
  if (!keyBuf || keyBuf.length !== 32) {
    return { error: 'Key must be 32 bytes (64 hex digits or base64) for AES-256.' }
  }
  const ivBuf = parseKeyMaterial(iv)
  if (!ivBuf || ivBuf.length !== 16) {
    return { error: 'IV must be 16 bytes (32 hex digits or base64).' }
  }
  const ctBuf = parseKeyMaterial(ciphertext)
  if (!ctBuf || ctBuf.length === 0 || ctBuf.length % 16 !== 0) {
    return { error: 'Ciphertext must be whole 16-byte blocks (hex or base64).' }
  }
  return { keyBuf, ivBuf, ctBuf }
}

export function decryptTextRaw({ ciphertext, key, iv, algorithm = 'aes-256-cbc' } = {}) {
  if (!RAW_DECRYPT_ALGORITHMS.includes(algorithm)) {
    return { ok: false, error: 'Unsupported algorithm.' }
  }
  const { error, keyBuf, ivBuf, ctBuf } = parseCbcInputs({ ciphertext, key, iv })
  if (error) return { ok: false, error }
  try {
    const decipher = createDecipheriv(algorithm, keyBuf, ivBuf)
    const plaintext = Buffer.concat([decipher.update(ctBuf), decipher.final()]).toString('utf8')
    return { ok: true, plaintext }
  } catch {
    return { ok: false, error: 'Decryption failed — wrong key or IV, or the data is corrupted.' }
  }
}
