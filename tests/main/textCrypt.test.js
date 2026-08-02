import { describe, expect, it } from 'vitest'
import { createCipheriv } from 'node:crypto'
import {
  ALGORITHMS,
  decryptText,
  decryptTextRaw,
  encryptText,
  TEXT_CRYPT_FORMAT
} from '../../src/main/textCrypt'

describe('encryptText / decryptText', () => {
  for (const algo of ALGORITHMS) {
    it(`round-trips plaintext with ${algo}`, async () => {
      const blob = await encryptText('the quick brown fox', 'correct horse battery staple', algo)
      const result = await decryptText(blob, 'correct horse battery staple')
      expect(result).toEqual({ ok: true, plaintext: 'the quick brown fox' })
    })

    it(`round-trips unicode plaintext with ${algo}`, async () => {
      const text = '日本語 — emoji 🎉'
      const blob = await encryptText(text, 'passphrase', algo)
      expect(await decryptText(blob, 'passphrase')).toEqual({ ok: true, plaintext: text })
    })
  }

  it('produces a self-describing blob with the expected format tag', async () => {
    const blob = await encryptText('secret', 'pw', 'aes-256-gcm')
    const envelope = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'))
    expect(envelope.format).toBe(TEXT_CRYPT_FORMAT)
    expect(envelope.algo).toBe('aes-256-gcm')
    expect(envelope.tag).toBeTruthy() // GCM auth tag present
  })

  it('records the pinned scrypt cost in the envelope', async () => {
    const blob = await encryptText('secret', 'pw')
    const envelope = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'))
    expect(envelope.kdf).toEqual({ N: 2 ** 17, r: 8, p: 1 })
  })

  it('rejects an unsupported algorithm', async () => {
    await expect(encryptText('x', 'pw', 'des-ecb')).rejects.toThrow()
  })

  it('no longer offers an unauthenticated mode (CBC dropped)', async () => {
    expect(ALGORITHMS).toEqual(['aes-256-gcm'])
    // A blob claiming the old CBC algorithm is refused, not decrypted without
    // integrity, because CBC is off the allowlist.
    await expect(encryptText('x', 'pw', 'aes-256-cbc')).rejects.toThrow()
    const legacyCbc = Buffer.from(
      JSON.stringify({
        format: TEXT_CRYPT_FORMAT,
        algo: 'aes-256-cbc',
        salt: 'AA==',
        iv: 'AAAAAAAAAAAAAAAAAAAAAA==',
        ciphertext: 'AA=='
      })
    ).toString('base64')
    expect(await decryptText(legacyCbc, 'pw')).toEqual({
      ok: false,
      error: 'Not a valid encrypted blob.'
    })
  })

  it('rejects a blob whose embedded kdf params are out of bounds', async () => {
    // A hostile envelope can't dictate an unbounded scrypt cost.
    const bad = Buffer.from(
      JSON.stringify({
        format: TEXT_CRYPT_FORMAT,
        algo: 'aes-256-gcm',
        kdf: { N: 2 ** 30, r: 8, p: 1 },
        salt: 'AA==',
        iv: 'AAAAAAAAAAAAAAAAAAAAAA==',
        ciphertext: 'AA==',
        tag: 'AAAAAAAAAAAAAAAAAAAAAA=='
      })
    ).toString('base64')
    expect(await decryptText(bad, 'pw')).toEqual({
      ok: false,
      error: 'Not a valid encrypted blob.'
    })
  })

  it('fails to decrypt with the wrong passphrase', async () => {
    const blob = await encryptText('secret', 'right-passphrase', 'aes-256-gcm')
    const result = await decryptText(blob, 'wrong-passphrase')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('detects tampering under GCM (authenticated)', async () => {
    const blob = await encryptText('secret', 'pw', 'aes-256-gcm')
    const envelope = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'))
    // Flip a byte in the ciphertext.
    const bytes = Buffer.from(envelope.ciphertext, 'base64')
    bytes[0] ^= 0xff
    envelope.ciphertext = bytes.toString('base64')
    const tamperedBlob = Buffer.from(JSON.stringify(envelope)).toString('base64')
    expect((await decryptText(tamperedBlob, 'pw')).ok).toBe(false)
  })

  it('rejects a blob that is not valid base64/JSON', async () => {
    expect(await decryptText('not a real blob', 'pw')).toEqual({
      ok: false,
      error: 'Not a valid encrypted blob.'
    })
  })

  it('rejects a blob missing required envelope fields', async () => {
    const bad = Buffer.from(JSON.stringify({ format: TEXT_CRYPT_FORMAT })).toString('base64')
    expect(await decryptText(bad, 'pw')).toEqual({
      ok: false,
      error: 'Not a valid encrypted blob.'
    })
  })

  it('rejects a blob with an unrecognized format tag', async () => {
    const bad = Buffer.from(
      JSON.stringify({
        format: 'something-else',
        algo: 'aes-256-gcm',
        salt: 'AA==',
        iv: 'AA==',
        tag: 'AA==',
        ciphertext: 'AA=='
      })
    ).toString('base64')
    expect(await decryptText(bad, 'pw')).toEqual({
      ok: false,
      error: 'Not a valid encrypted blob.'
    })
  })
})

describe('decryptTextRaw (AES-256-CBC interop)', () => {
  const KEY = Buffer.alloc(32, 7)
  const IV = Buffer.alloc(16, 3)
  const PLAIN = 'external payload — 日本語 🎉, more than one block long'
  const cbc = (text, key = KEY, iv = IV) => {
    const c = createCipheriv('aes-256-cbc', key, iv)
    return Buffer.concat([c.update(text, 'utf8'), c.final()])
  }

  it('decrypts with hex key, IV, and ciphertext', () => {
    const ct = cbc(PLAIN).toString('hex')
    expect(
      decryptTextRaw({ ciphertext: ct, key: KEY.toString('hex'), iv: IV.toString('hex') })
    ).toEqual({ ok: true, plaintext: PLAIN })
  })

  it('accepts base64 for every field', () => {
    const ct = cbc(PLAIN).toString('base64')
    expect(
      decryptTextRaw({ ciphertext: ct, key: KEY.toString('base64'), iv: IV.toString('base64') })
    ).toEqual({ ok: true, plaintext: PLAIN })
  })

  it('never reproduces the plaintext under a wrong key', () => {
    const ct = cbc(PLAIN).toString('hex')
    const wrong = Buffer.alloc(32, 9).toString('hex')
    const res = decryptTextRaw({ ciphertext: ct, key: wrong, iv: IV.toString('hex') })
    expect(res.ok === false || res.plaintext !== PLAIN).toBe(true)
  })

  it('corrupts the first block under a wrong IV (CBC has no integrity)', () => {
    const ct = cbc(PLAIN).toString('hex')
    const wrongIv = Buffer.alloc(16, 255).toString('hex')
    const res = decryptTextRaw({ ciphertext: ct, key: KEY.toString('hex'), iv: wrongIv })
    expect(res.ok === false || res.plaintext !== PLAIN).toBe(true)
  })

  it('rejects a key or IV of the wrong length', () => {
    const ct = cbc(PLAIN).toString('hex')
    expect(decryptTextRaw({ ciphertext: ct, key: 'abcd', iv: IV.toString('hex') }).error).toMatch(
      /Key must be 32 bytes/
    )
    expect(decryptTextRaw({ ciphertext: ct, key: KEY.toString('hex'), iv: 'abcd' }).error).toMatch(
      /IV must be 16 bytes/
    )
  })

  it('rejects ciphertext that is not whole 16-byte blocks', () => {
    expect(
      decryptTextRaw({ ciphertext: 'aabbcc', key: KEY.toString('hex'), iv: IV.toString('hex') })
        .error
    ).toMatch(/whole 16-byte blocks/)
  })

  it('refuses a non-CBC algorithm and missing fields', () => {
    const ct = cbc(PLAIN).toString('hex')
    expect(
      decryptTextRaw({
        ciphertext: ct,
        key: KEY.toString('hex'),
        iv: IV.toString('hex'),
        algorithm: 'aes-256-gcm'
      })
    ).toEqual({ ok: false, error: 'Unsupported algorithm.' })
    expect(decryptTextRaw({}).ok).toBe(false)
  })
})
