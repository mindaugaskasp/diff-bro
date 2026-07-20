// Pure crypto core for the "back up / restore configuration" feature — no
// Electron imports, unit-tested. config.js owns the file dialogs and the
// reads/writes of identity + trusted-keys files.
//
// A backup bundles this install's identity keypair, the trusted-keys list,
// the snippet library, and UI settings, all AES-256-GCM encrypted under a
// passphrase (scrypt-derived key, random salt embedded). No TTL, no signing:
// it's a personal backup meant to be restored by its owner. Diffs are
// deliberately NOT included (they are ephemeral and auto-expiring).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

export const CONFIG_FORMAT = 'diffbro-config/1'
const SCRYPT_KEYLEN = 32

export function sealConfig(bundle, passphrase) {
  const payload = Buffer.from(JSON.stringify(bundle))
  const salt = randomBytes(16)
  const key = scryptSync(passphrase, salt, SCRYPT_KEYLEN)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
  const envelope = {
    format: CONFIG_FORMAT,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }
  return Buffer.from(JSON.stringify(envelope)).toString('base64')
}

// Returns { ok: true, bundle } or { ok: false, error }.
export function openConfig(blob, passphrase) {
  let envelope
  try {
    envelope = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'))
  } catch {
    return { ok: false, error: 'not-a-config-file' }
  }
  if (
    envelope?.format !== CONFIG_FORMAT ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.tag !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    return { ok: false, error: 'not-a-config-file' }
  }
  try {
    const key = scryptSync(passphrase, Buffer.from(envelope.salt, 'base64'), SCRYPT_KEYLEN)
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
