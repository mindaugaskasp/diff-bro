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
  scryptSync,
  sign,
  verify
} from 'crypto'

export const SNIPPET_FORMAT = 'diffbro-snippets/1'

// sender: { priv: { sign: pem }, pub: { sign: pem, fingerprint } } — this
// install's identity, the same keys used for sealed diff sharing.
export function sealSnippets(bundle, passphrase, sender) {
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
  const key = scryptSync(passphrase, salt, 32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(inner), cipher.final()])

  return {
    format: SNIPPET_FORMAT,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }
}

// Returns { ok, bundle, signer } or { error }.
export function openSnippets(file, passphrase) {
  if (
    file?.format !== SNIPPET_FORMAT ||
    typeof file.salt !== 'string' ||
    typeof file.iv !== 'string' ||
    typeof file.tag !== 'string' ||
    typeof file.ciphertext !== 'string'
  ) {
    return { error: 'not-a-snippet-file' }
  }

  let inner
  try {
    const salt = Buffer.from(file.salt, 'base64')
    const key = scryptSync(passphrase, salt, 32)
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

  try {
    return {
      ok: true,
      bundle: JSON.parse(Buffer.from(inner.payload, 'base64').toString()),
      signer: inner.signer
    }
  } catch {
    return { error: 'corrupted' }
  }
}
