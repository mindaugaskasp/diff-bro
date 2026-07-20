import { describe, expect, it } from 'vitest'
import { ALGORITHMS, decryptText, encryptText, TEXT_CRYPT_FORMAT } from '../../src/main/textCrypt'

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
