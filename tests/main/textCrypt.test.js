import { describe, expect, it } from 'vitest'
import { ALGORITHMS, decryptText, encryptText, TEXT_CRYPT_FORMAT } from '../../src/main/textCrypt'

describe('encryptText / decryptText', () => {
  for (const algo of ALGORITHMS) {
    it(`round-trips plaintext with ${algo}`, () => {
      const blob = encryptText('the quick brown fox', 'correct horse battery staple', algo)
      const result = decryptText(blob, 'correct horse battery staple')
      expect(result).toEqual({ ok: true, plaintext: 'the quick brown fox' })
    })

    it(`round-trips unicode plaintext with ${algo}`, () => {
      const text = '日本語 — emoji 🎉'
      const blob = encryptText(text, 'passphrase', algo)
      expect(decryptText(blob, 'passphrase')).toEqual({ ok: true, plaintext: text })
    })
  }

  it('produces a self-describing blob with the expected format tag', () => {
    const blob = encryptText('secret', 'pw', 'aes-256-gcm')
    const envelope = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'))
    expect(envelope.format).toBe(TEXT_CRYPT_FORMAT)
    expect(envelope.algo).toBe('aes-256-gcm')
    expect(envelope.tag).toBeTruthy() // GCM auth tag present
  })

  it('rejects an unsupported algorithm', () => {
    expect(() => encryptText('x', 'pw', 'des-ecb')).toThrow()
  })

  it('fails to decrypt with the wrong passphrase', () => {
    const blob = encryptText('secret', 'right-passphrase', 'aes-256-gcm')
    const result = decryptText(blob, 'wrong-passphrase')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('detects tampering under GCM (authenticated)', () => {
    const blob = encryptText('secret', 'pw', 'aes-256-gcm')
    const envelope = JSON.parse(Buffer.from(blob, 'base64').toString('utf8'))
    // Flip a byte in the ciphertext.
    const bytes = Buffer.from(envelope.ciphertext, 'base64')
    bytes[0] ^= 0xff
    envelope.ciphertext = bytes.toString('base64')
    const tamperedBlob = Buffer.from(JSON.stringify(envelope)).toString('base64')
    expect(decryptText(tamperedBlob, 'pw').ok).toBe(false)
  })

  it('rejects a blob that is not valid base64/JSON', () => {
    expect(decryptText('not a real blob', 'pw')).toEqual({
      ok: false,
      error: 'Not a valid encrypted blob.'
    })
  })

  it('rejects a blob missing required envelope fields', () => {
    const bad = Buffer.from(JSON.stringify({ format: TEXT_CRYPT_FORMAT })).toString('base64')
    expect(decryptText(bad, 'pw')).toEqual({ ok: false, error: 'Not a valid encrypted blob.' })
  })

  it('rejects a blob with an unrecognized format tag', () => {
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
    expect(decryptText(bad, 'pw')).toEqual({ ok: false, error: 'Not a valid encrypted blob.' })
  })
})
