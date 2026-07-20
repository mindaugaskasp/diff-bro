// Pure crypto for exporting/reimporting Snippets categories as a
// passphrase-protected, signed file — deliberately separate from the
// sealed-share system in sealing.js, which is hard-capped at a 24 h TTL for
// ephemeral diff sharing. Snippet backups are meant to persist indefinitely,
// so there is no TTL here; instead:
//   - confidentiality + tamper-evidence come from AES-256-GCM, keyed by a
//     passphrase you choose (scrypt-derived) — portable, no recipient key
//     exchange needed, unlike sealed diff shares.
//   - the signer's public key and Ed25519 signature travel INSIDE the
//     encrypted envelope (not just alongside it), so importing only ever
//     needs the passphrase; it self-certifies that the payload wasn't
//     altered after signing, but (unlike sealed shares) does not by itself
//     prove the signer is someone you already trust — compare the returned
//     fingerprint against Share → your fingerprint, or a trusted peer's, if
//     that matters for your use case.
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify
} from 'crypto'
import { SCRYPT_PARAMS, deriveKey, scryptParamsFor } from './kdf'

export const SNIPPET_FORMAT = 'diffbro-snippets/1'

// A decryptable file is NOT a trustworthy one: the passphrase gates
// confidentiality, not the sender's honesty. So an imported bundle is treated
// as hostile input and validated in shape and size before anything downstream
// touches it — the same rigor share:addTrustedKey applies to key files.
// Without this, a malformed-but-decryptable bundle could: make vaultEncrypt
// throw mid-import (non-string content) leaving a partial import, or blow the
// ~5 MB localStorage quota so every later persist() throws and the store stops
// saving entirely. Caps are generous for real use but bounded.
export const SNIPPET_LIMITS = {
  categories: 200,
  snippetsPerCategory: 1000,
  nameBytes: 512,
  languageBytes: 64,
  contentBytes: 512 * 1024, // 512 KB per snippet
  totalContentBytes: 3 * 1024 * 1024 // 3 MB across the whole bundle
}

const byteLen = (s) => Buffer.byteLength(s, 'utf8')

// Returns null when `bundle` is a well-formed, within-caps snippet bundle, or
// an error code ('malformed' | 'too-large') otherwise. Pure and unit-tested.
export function validateSnippetBundle(bundle, limits = SNIPPET_LIMITS) {
  if (!bundle || typeof bundle !== 'object' || !Array.isArray(bundle.categories)) {
    return 'malformed'
  }
  if (bundle.categories.length > limits.categories) return 'too-large'

  let totalContent = 0
  for (const category of bundle.categories) {
    if (!category || typeof category !== 'object') return 'malformed'
    if (typeof category.name !== 'string' || byteLen(category.name) > limits.nameBytes) {
      return 'malformed'
    }
    if (!Array.isArray(category.snippets)) return 'malformed'
    if (category.snippets.length > limits.snippetsPerCategory) return 'too-large'

    for (const snippet of category.snippets) {
      if (!snippet || typeof snippet !== 'object') return 'malformed'
      if (typeof snippet.name !== 'string' || byteLen(snippet.name) > limits.nameBytes) {
        return 'malformed'
      }
      if (typeof snippet.content !== 'string') return 'malformed'
      // language is optional; when present it must be a short string.
      if (
        snippet.language != null &&
        (typeof snippet.language !== 'string' || byteLen(snippet.language) > limits.languageBytes)
      ) {
        return 'malformed'
      }
      const size = byteLen(snippet.content)
      if (size > limits.contentBytes) return 'too-large'
      totalContent += size
      if (totalContent > limits.totalContentBytes) return 'too-large'
    }
  }
  return null
}

// sender: { priv: { sign: pem }, pub: { sign: pem, fingerprint } } — this
// install's identity, the same keys used for sealed diff sharing.
export async function sealSnippets(bundle, passphrase, sender) {
  const payload = Buffer.from(JSON.stringify(bundle))
  const signature = sign(null, payload, createPrivateKey(sender.priv.sign))

  const inner = Buffer.from(
    JSON.stringify({
      payload: payload.toString('base64'),
      signer: sender.pub.fingerprint,
      signerKey: sender.pub.sign,
      signature: signature.toString('base64')
    })
  )

  const salt = randomBytes(16)
  const key = await deriveKey(passphrase, salt)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(inner), cipher.final()])

  return {
    format: SNIPPET_FORMAT,
    kdf: SCRYPT_PARAMS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }
}

// Returns { ok, bundle, signer } or { error }.
export async function openSnippets(file, passphrase) {
  const params = scryptParamsFor(file)
  if (
    file?.format !== SNIPPET_FORMAT ||
    typeof file.salt !== 'string' ||
    typeof file.iv !== 'string' ||
    typeof file.tag !== 'string' ||
    typeof file.ciphertext !== 'string' ||
    params === null
  ) {
    return { error: 'not-a-snippet-file' }
  }

  let inner
  try {
    const salt = Buffer.from(file.salt, 'base64')
    const key = await deriveKey(passphrase, salt, params)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(file.tag, 'base64'))
    inner = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(file.ciphertext, 'base64')),
        decipher.final()
      ]).toString()
    )
  } catch {
    return { error: 'wrong-passphrase' }
  }

  let signatureOk
  try {
    signatureOk = verify(
      null,
      Buffer.from(inner.payload, 'base64'),
      createPublicKey(inner.signerKey),
      Buffer.from(inner.signature, 'base64')
    )
  } catch {
    signatureOk = false
  }
  if (!signatureOk) return { error: 'bad-signature' }

  let bundle
  try {
    bundle = JSON.parse(Buffer.from(inner.payload, 'base64').toString())
  } catch {
    return { error: 'corrupted' }
  }
  // Decryptable + signed still isn't trusted-shaped — validate before returning.
  const invalid = validateSnippetBundle(bundle)
  if (invalid) return { error: invalid }
  return { ok: true, bundle, signer: inner.signer }
}
