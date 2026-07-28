// Pure crypto for config backup/restore (share.js owns the file glue): identity
// keys + trusted keys + snippets + settings, AES-256-GCM under a scrypt-derived
// passphrase. No TTL/signing — a personal backup. Diffs excluded (ephemeral).
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { SCRYPT_PARAMS, deriveKey, scryptParamsFor } from './kdf'

export const CONFIG_FORMAT = 'diffbro-config/1'

export async function sealConfig(bundle, passphrase) {
  const payload = Buffer.from(JSON.stringify(bundle))
  const salt = randomBytes(16)
  const key = await deriveKey(passphrase, salt)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
  const envelope = {
    format: CONFIG_FORMAT,
    kdf: SCRYPT_PARAMS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }
  return Buffer.from(JSON.stringify(envelope)).toString('base64')
}

// Returns { ok: true, bundle } or { ok: false, error }.
export async function openConfig(blob, passphrase) {
  let envelope
  try {
    envelope = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'))
  } catch {
    return { ok: false, error: 'not-a-config-file' }
  }
  const params = scryptParamsFor(envelope)
  if (
    envelope?.format !== CONFIG_FORMAT ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.tag !== 'string' ||
    typeof envelope.ciphertext !== 'string' ||
    params === null
  ) {
    return { ok: false, error: 'not-a-config-file' }
  }
  try {
    const key = await deriveKey(passphrase, Buffer.from(envelope.salt, 'base64'), params)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    const plain = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8')
    return { ok: true, bundle: JSON.parse(plain) }
  } catch {
    return { ok: false, error: 'wrong-passphrase' }
  }
}
