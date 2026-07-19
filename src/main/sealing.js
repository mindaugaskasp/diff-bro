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

export const KEY_FORMAT = 'diffbro-key/1'
export const SHARE_FORMAT = 'diffbro-share/2'
export const MAX_TTL_MS = 24 * 3600 * 1000

const HKDF_INFO = 'diffbro-share/2'

// Fingerprint covers both public keys, so neither can be swapped alone.
export function fingerprint(signPem, boxPem) {
  const h = createHash('sha256')
  h.update(createPublicKey(signPem).export({ type: 'spki', format: 'der' }))
  h.update(createPublicKey(boxPem).export({ type: 'spki', format: 'der' }))
  return h.digest('hex').slice(0, 16)
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
