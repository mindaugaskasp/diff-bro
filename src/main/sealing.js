// Pure crypto core for sealed diff sharing — no Electron imports, fully
// unit-testable. share.js owns the IPC/dialog/persistence glue around this.
//
// A .diffbro share file is sign-then-encrypt:
//   inner envelope = { payload, signer fingerprint, Ed25519 signature }
//   outer          = AES-256-GCM of the inner envelope, key derived via
//                    HKDF from ECDH(ephemeral X25519, recipient X25519)
// Both layers are bound to the addressed recipient: the signature covers
// payload ‖ recipient-fingerprint (so a recipient cannot re-seal the signed
// payload for a third machine and pass it off as the sender's), and the GCM
// AAD covers format ‖ recipient-fingerprint (so the outer header cannot be
// re-addressed).
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

// Versioned wire formats. These are the ONLY versions this release writes and
// accepts — both key parsing and openSealed require an exact match, so a file
// in any other version is refused. Rotation / revocation policy: if a format
// is ever found vulnerable, bump its version here (e.g. `diffbro-key/3`) and
// ship it in a new release. From that release on, files in the old version
// stop opening (exact-match rejection) and every new file is written in the
// new version — a compromised format can't be reused. `HKDF_INFO` and the GCM
// AAD are tied to SHARE_FORMAT, so a share-format bump also re-keys/re-binds.
//
// key/2 + share/3 widened the fingerprint from 64 to 128 bits (see
// `fingerprint`). New files are written in these versions.
export const KEY_FORMAT = 'diffbro-key/2'
export const SHARE_FORMAT = 'diffbro-share/3'
export const MAX_TTL_MS = 24 * 3600 * 1000

// Public-key FILES stay importable across the version bump: a key file only
// carries key material, and the fingerprint is always RECOMPUTED at 128 bits
// on import (never trusted from the file), so an older-format key has no
// weaker binding to reuse — accepting it just re-labels the same keys. Shares
// are the opposite: SHARE_FORMAT is matched exactly, because a share's 64-bit
// binding was baked into its signature and GCM AAD, so old shares must be
// rejected outright.
export const ACCEPTED_KEY_FORMATS = ['diffbro-key/2', 'diffbro-key/1']
export const isAcceptedKeyFormat = (fmt) => ACCEPTED_KEY_FORMATS.includes(fmt)

// A public key may carry an optional self-chosen display label so a recipient
// sees a human name ("Alice — laptop") instead of a hex fingerprint when
// importing. The label is a COSMETIC HINT ONLY: it is not part of the
// fingerprint and is never used for any trust decision, so it stays untrusted
// input — collapse whitespace/control chars and hard-cap the length here.
export const MAX_LABEL_LEN = 80
export function cleanLabel(value) {
  if (typeof value !== 'string') return ''
  // Turn any C0 control char or DEL into a space (so a label can't be
  // multi-line or carry terminal control codes), collapse whitespace, trim,
  // hard-cap. Vue renders this as text, so it's defense in depth.
  let out = ''
  for (const ch of value) {
    const c = ch.codePointAt(0)
    out += c < 0x20 || c === 0x7f ? ' ' : ch
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LEN)
}

const HKDF_INFO = SHARE_FORMAT

// Fingerprint covers both public keys, so neither can be swapped alone. It is
// the anchor for every trust decision — trusted-key lookup, the recipient
// binding in the signature (payload ‖ recipient-fp), and the GCM AAD — so it
// must be wide enough to resist a crafted-keypair second preimage. 128 bits
// (32 hex chars) keeps a targeted second preimage at ~2^128 and collisions
// (adversary controls both keys) at ~2^64.
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
// so a shared diff can never outlive 24 h anywhere.
export function ttlError(entry, now = Date.now()) {
  if (!Number.isFinite(entry?.createdAt) || !Number.isFinite(entry?.expiresAt)) return 'invalid-ttl'
  if (entry.expiresAt <= now) return 'expired'
  if (entry.expiresAt - entry.createdAt > MAX_TTL_MS) return 'invalid-ttl'
  return null
}

const deriveKey = (ecdhSecret, salt) =>
  Buffer.from(hkdfSync('sha256', ecdhSecret, salt, HKDF_INFO, 32))
const signedData = (payload, recipientFp) => Buffer.concat([payload, Buffer.from(recipientFp)])
const aadFor = (recipientFp) => Buffer.from(`${SHARE_FORMAT}|${recipientFp}`)

// .diffbrokey obfuscation. A public key isn't secret (it's meant to be
// shared), so this is deliberately obfuscation, not encryption: it just keeps
// the file from being plainly readable/parseable in a text editor. New
// exports get the `dbk1:` base64 envelope; import still accepts legacy plain
// JSON so keys exchanged with older versions keep working. The fingerprint is
// always recomputed from the decoded key material, so the encoding is never
// trusted for integrity.
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

export function hasShareShape(file) {
  return !!(
    file &&
    file.format === SHARE_FORMAT &&
    file.to &&
    file.epk &&
    file.iv &&
    file.tag &&
    file.ciphertext
  )
}

// The on-disk filename is derived from the (GCM-authenticated) ciphertext, so
// it reveals nothing about the diff's name/content and lets the opener detect
// a renamed file: import recomputes this and refuses to read a mismatch. The
// ciphertext is already tamper-evident via its GCM tag, so this only needs to
// bind the name to the bytes, not re-authenticate them.
export function shareFilename(file) {
  return (
    createHash('sha256').update(String(file.ciphertext)).digest('hex').slice(0, 32) + '.diffbro'
  )
}

// Seal `entry` for one recipient. sender: { priv: {sign}, fingerprint }.
// recipient: { fingerprint, box (public PEM) }. Returns the share-file object.
export function sealEntry(entry, sender, recipient) {
  const payload = Buffer.from(JSON.stringify(entry))
  const inner = Buffer.from(
    JSON.stringify({
      payload: payload.toString('base64'),
      signer: sender.fingerprint,
      signature: sign(
        null,
        signedData(payload, recipient.fingerprint),
        createPrivateKey(sender.priv.sign)
      ).toString('base64')
    })
  )

  const eph = generateKeyPairSync('x25519')
  const secret = diffieHellman({
    privateKey: eph.privateKey,
    publicKey: createPublicKey(recipient.box)
  })
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv)
  cipher.setAAD(aadFor(recipient.fingerprint))
  const ciphertext = Buffer.concat([cipher.update(inner), cipher.final()])

  return {
    format: SHARE_FORMAT,
    to: recipient.fingerprint,
    epk: eph.publicKey.export({ type: 'spki', format: 'pem' }),
    salt: salt.toString('base64'),
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
  if (file.to !== me.pub.fingerprint) return { error: 'not-for-you' }

  // Decrypt; a failed GCM tag means the file was modified in transit.
  let inner
  try {
    const secret = diffieHellman({
      privateKey: createPrivateKey(me.priv.box),
      publicKey: createPublicKey(file.epk)
    })
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(secret, Buffer.from(file.salt, 'base64')),
      Buffer.from(file.iv, 'base64')
    )
    decipher.setAAD(aadFor(me.pub.fingerprint))
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
    signedData(payload, me.pub.fingerprint), // signature must name US as recipient
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
