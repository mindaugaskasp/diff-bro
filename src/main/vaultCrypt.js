// Pure AES-256-GCM helpers for the saved-diff vault (vault.js owns the key +
// IPC). Layout is ciphertext‖16-byte tag (WebCrypto-compatible); metadata rides
// as AAD, so tampering with it makes the entry undecryptable.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const GCM_TAG_BYTES = 16

export function vaultEncrypt(key, plaintext, aad) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad))
  const data = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag()
  ])
  return { iv: iv.toString('base64'), data: data.toString('base64') }
}

// Returns the plaintext string, or null when authentication fails
// (tampered metadata, wrong key, corrupted data).
export function vaultDecrypt(key, { iv, data }, aad) {
  try {
    const buf = Buffer.from(data, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAAD(Buffer.from(aad))
    decipher.setAuthTag(buf.subarray(buf.length - GCM_TAG_BYTES))
    return Buffer.concat([
      decipher.update(buf.subarray(0, buf.length - GCM_TAG_BYTES)),
      decipher.final()
    ]).toString('utf8')
  } catch {
    return null
  }
}
