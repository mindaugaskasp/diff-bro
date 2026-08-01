// Pure crypto core for sealed diff sharing (share.js owns the IPC/glue). A
// .diffbro file is sign-then-encrypt: an Ed25519-signed inner envelope inside
// AES-256-GCM under a random content key, which is itself wrapped per recipient
// (HKDF over ECDH). Both layers bind the AUDIENCE — the whole recipient set —
// so a signed payload can't be re-sealed or re-addressed. See audienceOf.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify
} from 'crypto'

// The ONLY versions this release writes/accepts — exact-match rejection retires
// a vulnerable format by a version bump (HKDF_INFO + GCM AAD are tied to
// SHARE_FORMAT, so a bump re-keys/re-binds). key/2 + share/3 widened the
// fingerprint to 128 bits.
export const KEY_FORMAT = 'diffbro-key/2'
// share/4 seals to an AUDIENCE rather than one recipient: the diff is encrypted
// once under a random content key, and that key is wrapped per recipient.
export const SHARE_FORMAT = 'diffbro-share/4'
// Enforced when signing AND when opening. Keep in step with vaultStore's
// MAX_KEEP_HOURS. With no replay protection by design, this IS the replay window.
export const MAX_TTL_MS = 7 * 24 * 3600 * 1000

// Key FILES stay importable across the bump: the fingerprint is always
// RECOMPUTED at 128 bits on import, never trusted from the file. Shares are
// matched exactly, since their 64-bit binding was baked into signature + AAD.
export const ACCEPTED_KEY_FORMATS = ['diffbro-key/2', 'diffbro-key/1']
export const isAcceptedKeyFormat = (fmt) => ACCEPTED_KEY_FORMATS.includes(fmt)

// Cosmetic display label only — never part of the fingerprint or any trust
// decision, so treat as untrusted: strip control chars, collapse, hard-cap.
export const MAX_LABEL_LEN = 80
export function cleanLabel(value) {
  if (typeof value !== 'string') return ''
  let out = ''
  for (const ch of value) {
    const c = ch.codePointAt(0)
    out += c < 0x20 || c === 0x7f ? ' ' : ch
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LEN)
}

const HKDF_INFO = SHARE_FORMAT

// Covers both public keys and anchors every trust decision, so it must resist a
// crafted-keypair second preimage: 128 bits keeps that at ~2^128 (collisions,
// where the adversary controls both keys, at ~2^64).
export function fingerprint(signPem, boxPem) {
  const h = createHash('sha256')
  h.update(createPublicKey(signPem).export({ type: 'spki', format: 'der' }))
  h.update(createPublicKey(boxPem).export({ type: 'spki', format: 'der' }))
  return h.digest('hex').slice(0, 32)
}

// Fresh Ed25519 (signing) + X25519 (key agreement) identity.
export function createIdentityKeys() {
  const signPair = generateKeyPairSync('ed25519')
  const boxPair = generateKeyPairSync('x25519')
  const priv = {
    sign: signPair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    box: boxPair.privateKey.export({ type: 'pkcs8', format: 'pem' })
  }
  const pubKeys = {
    sign: signPair.publicKey.export({ type: 'spki', format: 'pem' }),
    box: boxPair.publicKey.export({ type: 'spki', format: 'pem' })
  }
  const pub = {
    format: KEY_FORMAT,
    ...pubKeys,
    fingerprint: fingerprint(pubKeys.sign, pubKeys.box)
  }
  return { priv, pub }
}

// 'expired' | 'invalid-ttl' | null — enforced when signing AND when opening,
// so a shared diff can never outlive MAX_TTL_MS anywhere.
export function ttlError(entry, now = Date.now()) {
  if (!Number.isFinite(entry?.createdAt) || !Number.isFinite(entry?.expiresAt)) return 'invalid-ttl'
  if (entry.expiresAt <= now) return 'expired'
  if (entry.expiresAt - entry.createdAt > MAX_TTL_MS) return 'invalid-ttl'
  return null
}

const deriveKey = (ecdhSecret, salt) =>
  Buffer.from(hkdfSync('sha256', ecdhSecret, salt, HKDF_INFO, 32))

/**
 * The whole recipient set, as one value. Everything commits to THIS rather than
 * to a single fingerprint, which is what stops a sealed file being re-addressed:
 * edit the list and the signature and both AAD layers stop matching. Sorted, so
 * the same set always digests the same however it was ordered.
 * @param {string[]} fingerprints
 * @returns {string}
 */
export function audienceOf(fingerprints) {
  const sorted = [...new Set(fingerprints)].sort()
  return createHash('sha256').update(sorted.join('|')).digest('hex').slice(0, 32)
}

const signedData = (payload, audience) => Buffer.concat([payload, Buffer.from(audience)])
// The content is bound to the audience; each wrapped key additionally to the one
// recipient it was wrapped for, so a key lifted from another entry fails.
const contentAad = (audience) => Buffer.from(`${SHARE_FORMAT}|${audience}`)
const keyAad = (recipientFp, audience) => Buffer.from(`${SHARE_FORMAT}|${recipientFp}|${audience}`)

// A public key isn't secret, so the `dbk1:` envelope is obfuscation, not
// encryption. Import still accepts legacy plain JSON; the fingerprint is always
// recomputed, never trusted from the encoding.
const KEY_ENVELOPE_PREFIX = 'dbk1:'
export function encodePublicKey(pub) {
  return KEY_ENVELOPE_PREFIX + Buffer.from(JSON.stringify(pub)).toString('base64')
}
export function decodePublicKey(text) {
  const t = String(text).trim()
  if (t.startsWith(KEY_ENVELOPE_PREFIX)) {
    return JSON.parse(Buffer.from(t.slice(KEY_ENVELOPE_PREFIX.length), 'base64').toString('utf8'))
  }
  return JSON.parse(t) // legacy plain-JSON key file
}

const isFingerprintList = (v) =>
  Array.isArray(v) && v.length > 0 && v.every((fp) => typeof fp === 'string')

export function hasShareShape(file) {
  if (!file || file.format !== SHARE_FORMAT) return false
  if (!isFingerprintList(file.to)) return false
  if (!Array.isArray(file.keys) || !file.keys.length) return false
  return !!(file.epk && file.iv && file.tag && file.ciphertext)
}

// Derived from the GCM-authenticated ciphertext: reveals nothing about the diff
// and lets the opener detect a renamed file (import recomputes + refuses a
// mismatch).
export function shareFilename(file) {
  return (
    createHash('sha256').update(String(file.ciphertext)).digest('hex').slice(0, 32) + '.diffbro'
  )
}

// One recipient or a list; a lone one is just an audience of one.
const asList = (recipients) => (Array.isArray(recipients) ? recipients : [recipients])

// The content key, wrapped to one recipient under a shared ephemeral key. Each
// recipient's own X25519 key makes their ECDH secret — and so their wrap — distinct.
function wrapContentKey(cek, ephPrivateKey, recipient, audience) {
  const secret = diffieHellman({
    privateKey: ephPrivateKey,
    publicKey: createPublicKey(recipient.box)
  })
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv)
  cipher.setAAD(keyAad(recipient.fingerprint, audience))
  const key = Buffer.concat([cipher.update(cek), cipher.final()])
  return {
    to: recipient.fingerprint,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    key: key.toString('base64')
  }
}

/**
 * Seal `entry` for one recipient or a whole team.
 * @param {object} entry
 * @param {{ priv: { sign: string }, fingerprint: string }} sender
 * @param {{ fingerprint: string, box: string }|Array<{ fingerprint: string, box: string }>} recipients
 * @returns {object} the share-file
 */
export function sealEntry(entry, sender, recipients) {
  const list = asList(recipients).filter((r) => r?.fingerprint && r?.box)
  const unique = [...new Map(list.map((r) => [r.fingerprint, r])).values()]
  if (!unique.length) throw new Error('sealEntry: no recipients')
  const audience = audienceOf(unique.map((r) => r.fingerprint))

  const payload = Buffer.from(JSON.stringify(entry))
  const inner = Buffer.from(
    JSON.stringify({
      payload: payload.toString('base64'),
      signer: sender.fingerprint,
      signature: sign(
        null,
        signedData(payload, audience),
        createPrivateKey(sender.priv.sign)
      ).toString('base64')
    })
  )

  const cek = randomBytes(32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', cek, iv)
  cipher.setAAD(contentAad(audience))
  const ciphertext = Buffer.concat([cipher.update(inner), cipher.final()])

  const eph = generateKeyPairSync('x25519')
  // Sorted, so `to` and `keys` line up and two seals of the same set look alike.
  const ordered = [...unique].sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : 1))
  return {
    format: SHARE_FORMAT,
    to: ordered.map((r) => r.fingerprint),
    epk: eph.publicKey.export({ type: 'spki', format: 'pem' }),
    keys: ordered.map((r) => wrapContentKey(cek, eph.privateKey, r, audience)),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }
}

// Open a sealed file as `me` ({ priv: {box}, pub: {fingerprint} }) against a
// trusted-senders list ([{ fingerprint, label, sign }]). Returns
// { ok, entry, from } or { error, ... } with the codes the UI maps to text.
export function openSealed(file, me, trustedList, now = Date.now()) {
  if (!hasShareShape(file)) return { error: 'not-a-share-file' }
  const mine = file.keys.find((k) => k?.to === me.pub.fingerprint)
  if (!mine || !file.to.includes(me.pub.fingerprint)) return { error: 'not-for-you' }
  // Recomputed from the list the FILE carries, so any edit to it fails the AADs
  // below rather than being taken at face value.
  const audience = audienceOf(file.to)

  // Unwrap our copy of the content key, then the diff. A failed GCM tag either
  // way means the file (or its recipient list) was modified in transit.
  let inner
  try {
    const secret = diffieHellman({
      privateKey: createPrivateKey(me.priv.box),
      publicKey: createPublicKey(file.epk)
    })
    const unwrap = createDecipheriv(
      'aes-256-gcm',
      deriveKey(secret, Buffer.from(mine.salt, 'base64')),
      Buffer.from(mine.iv, 'base64')
    )
    unwrap.setAAD(keyAad(me.pub.fingerprint, audience))
    unwrap.setAuthTag(Buffer.from(mine.tag, 'base64'))
    const cek = Buffer.concat([unwrap.update(Buffer.from(mine.key, 'base64')), unwrap.final()])

    const decipher = createDecipheriv('aes-256-gcm', cek, Buffer.from(file.iv, 'base64'))
    decipher.setAAD(contentAad(audience))
    decipher.setAuthTag(Buffer.from(file.tag, 'base64'))
    inner = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(file.ciphertext, 'base64')),
        decipher.final()
      ]).toString()
    )
  } catch {
    return { error: 'tampered' }
  }

  const trusted = trustedList.find((t) => t.fingerprint === inner.signer)
  if (!trusted) return { error: 'unknown-signer', signer: inner.signer }

  const payload = Buffer.from(inner.payload, 'base64')
  const ok = verify(
    null,
    signedData(payload, audience), // the signature names the whole audience
    createPublicKey(trusted.sign),
    Buffer.from(inner.signature, 'base64')
  )
  if (!ok) return { error: 'bad-signature', from: trusted.label }

  let entry
  try {
    entry = JSON.parse(payload.toString())
  } catch {
    return { error: 'not-a-share-file' }
  }
  const ttl = ttlError(entry, now)
  if (ttl) return { error: ttl, from: trusted.label }

  return { ok: true, entry, from: trusted.label }
}
