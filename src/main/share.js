// Secure diff sharing — sealed, signed, expiring.
//
// Every install has two keypairs (generated on first use, private halves
// wrapped by the OS keychain via safeStorage):
//   - Ed25519 for signing
//   - X25519 for key agreement (encryption)
// Peers exchange .diffbrokey files (public halves only) out of band and
// import them via "Add Trusted Key" — the exchange must happen in BOTH
// directions before sharing works, because a share file is addressed to
// one specific recipient.
//
// A .diffbro share file is sign-then-encrypt:
//   inner envelope = { payload, signer fingerprint, Ed25519 signature }
//   outer          = AES-256-GCM of the inner envelope, key derived via
//                    HKDF from ECDH(ephemeral X25519, recipient X25519)
// Consequences:
//   - only the addressed recipient can read the contents (network
//     eavesdroppers see ciphertext; the ephemeral key gives each file a
//     fresh encryption key)
//   - any modification — including bumping expiresAt — breaks the GCM auth
//     tag, and the timestamps are additionally covered by the signature
//   - the receiver rejects unknown signers, expired payloads, and TTLs
//     over 24 h, so shared diffs die at the same absolute moment everywhere
import { app, dialog, ipcMain, safeStorage } from 'electron'
import { readFile, writeFile } from 'fs/promises'
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
import { basename, join } from 'path'

const KEY_FORMAT = 'diffbro-key/1'
const SHARE_FORMAT = 'diffbro-share/2'
const HKDF_INFO = 'diffbro-share/2'
const MAX_TTL_MS = 24 * 3600 * 1000
const PLAIN_PREFIX = 'plain:'

const privPath = () => join(app.getPath('userData'), 'identity.key')
const pubPath = () => join(app.getPath('userData'), 'identity.pub')
const trustPath = () => join(app.getPath('userData'), 'trusted-keys.json')

// Fingerprint covers both public keys, so neither can be swapped alone.
function fingerprint(signPem, boxPem) {
  const h = createHash('sha256')
  h.update(createPublicKey(signPem).export({ type: 'spki', format: 'der' }))
  h.update(createPublicKey(boxPem).export({ type: 'spki', format: 'der' }))
  return h.digest('hex').slice(0, 16)
}

async function getIdentity() {
  try {
    const [rawPriv, rawPub] = await Promise.all([readFile(privPath()), readFile(pubPath(), 'utf-8')])
    const privJson = rawPriv.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX
      ? rawPriv.subarray(PLAIN_PREFIX.length).toString()
      : safeStorage.decryptString(rawPriv)
    return { priv: JSON.parse(privJson), pub: JSON.parse(rawPub) }
  } catch {
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
    const pub = { format: KEY_FORMAT, ...pubKeys, fingerprint: fingerprint(pubKeys.sign, pubKeys.box) }
    const privJson = JSON.stringify(priv)
    const out = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(privJson)
      : Buffer.from(PLAIN_PREFIX + privJson)
    await writeFile(privPath(), out, { mode: 0o600 })
    await writeFile(pubPath(), JSON.stringify(pub, null, 2))
    return { priv, pub }
  }
}

async function readTrusted() {
  try {
    return JSON.parse(await readFile(trustPath(), 'utf-8')) ?? []
  } catch {
    return []
  }
}

function deriveKey(ecdhSecret, salt) {
  return Buffer.from(hkdfSync('sha256', ecdhSecret, salt, HKDF_INFO, 32))
}

export function registerShareIpc() {
  ipcMain.handle('share:listTrusted', async () => {
    return (await readTrusted()).map(({ fingerprint: fp, label }) => ({ fingerprint: fp, label }))
  })

  // Export one saved diff as a sealed file addressed to `recipientFp`.
  // entry: { name, createdAt, expiresAt, snapshot }
  ipcMain.handle('share:export', async (e, entry, recipientFp) => {
    const recipient = (await readTrusted()).find((t) => t.fingerprint === recipientFp)
    if (!recipient) return { error: 'unknown-recipient' }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Share diff (sealed for one recipient)',
      defaultPath: `${entry.name.replace(/[^\w.-]+/g, '_')}.diffbro`,
      filters: [{ name: 'DiffBro shared diff', extensions: ['diffbro'] }]
    })
    if (canceled || !filePath) return { canceled: true }

    const { priv, pub } = await getIdentity()

    // Sign the payload (timestamps included) with our Ed25519 key.
    const payload = Buffer.from(JSON.stringify(entry))
    const inner = Buffer.from(
      JSON.stringify({
        payload: payload.toString('base64'),
        signer: pub.fingerprint,
        signature: sign(null, payload, createPrivateKey(priv.sign)).toString('base64')
      })
    )

    // Seal to the recipient: ephemeral X25519 → ECDH → HKDF → AES-256-GCM.
    const eph = generateKeyPairSync('x25519')
    const secret = diffieHellman({
      privateKey: eph.privateKey,
      publicKey: createPublicKey(recipient.box)
    })
    const salt = randomBytes(16)
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv)
    const ciphertext = Buffer.concat([cipher.update(inner), cipher.final()])

    const file = {
      format: SHARE_FORMAT,
      to: recipientFp,
      epk: eph.publicKey.export({ type: 'spki', format: 'pem' }),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    }
    await writeFile(filePath, JSON.stringify(file, null, 2))
    return { ok: true, path: filePath, to: recipient.label }
  })

  ipcMain.handle('share:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import shared diff',
      properties: ['openFile'],
      filters: [{ name: 'DiffBro shared diff', extensions: ['diffbro'] }]
    })
    if (canceled || !filePaths.length) return { canceled: true }

    let file
    try {
      file = JSON.parse(await readFile(filePaths[0], 'utf-8'))
    } catch {
      return { error: 'not-a-share-file' }
    }
    if (file.format !== SHARE_FORMAT || !file.to || !file.epk || !file.iv || !file.tag || !file.ciphertext) {
      return { error: 'not-a-share-file' }
    }

    const { priv, pub } = await getIdentity()
    if (file.to !== pub.fingerprint) return { error: 'not-for-you' }

    // Decrypt; a failed GCM tag means the file was modified in transit.
    let inner
    try {
      const secret = diffieHellman({
        privateKey: createPrivateKey(priv.box),
        publicKey: createPublicKey(file.epk)
      })
      const decipher = createDecipheriv(
        'aes-256-gcm',
        deriveKey(secret, Buffer.from(file.salt, 'base64')),
        Buffer.from(file.iv, 'base64')
      )
      decipher.setAuthTag(Buffer.from(file.tag, 'base64'))
      inner = JSON.parse(
        Buffer.concat([decipher.update(Buffer.from(file.ciphertext, 'base64')), decipher.final()]).toString()
      )
    } catch {
      return { error: 'tampered' }
    }

    const trusted = (await readTrusted()).find((t) => t.fingerprint === inner.signer)
    if (!trusted) return { error: 'unknown-signer', signer: inner.signer }

    const payload = Buffer.from(inner.payload, 'base64')
    const ok = verify(
      null,
      payload,
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
    const now = Date.now()
    if (!entry.expiresAt || entry.expiresAt <= now) return { error: 'expired', from: trusted.label }
    if (entry.expiresAt - (entry.createdAt ?? now) > MAX_TTL_MS) return { error: 'invalid-ttl' }

    return { ok: true, entry, from: trusted.label }
  })

  // Save this install's public keys so they can be handed to other machines.
  ipcMain.handle('share:exportPublicKey', async () => {
    const { pub } = await getIdentity()
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export my public key',
      defaultPath: `diffbro-${pub.fingerprint}.diffbrokey`,
      filters: [{ name: 'DiffBro public key', extensions: ['diffbrokey'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    await writeFile(filePath, JSON.stringify(pub, null, 2))
    return { ok: true, path: filePath, fingerprint: pub.fingerprint }
  })

  // Trust a peer's public keys (received out of band).
  ipcMain.handle('share:addTrustedKey', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Add trusted public key',
      properties: ['openFile'],
      filters: [{ name: 'DiffBro public key', extensions: ['diffbrokey'] }]
    })
    if (canceled || !filePaths.length) return { canceled: true }

    let key, fp
    try {
      key = JSON.parse(await readFile(filePaths[0], 'utf-8'))
      if (key.format !== KEY_FORMAT || !key.sign || !key.box) throw new Error('bad format')
      fp = fingerprint(key.sign, key.box) // recompute — never trust the stated one
    } catch {
      return { error: 'not-a-key' }
    }
    const label = basename(filePaths[0]).replace(/\.diffbrokey$/i, '')
    const trusted = (await readTrusted()).filter((t) => t.fingerprint !== fp)
    trusted.push({ fingerprint: fp, label, sign: key.sign, box: key.box })
    await writeFile(trustPath(), JSON.stringify(trusted, null, 2))
    return { ok: true, label, fingerprint: fp }
  })
}
