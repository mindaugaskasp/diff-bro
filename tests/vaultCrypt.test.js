import { describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../src/main/vaultCrypt'

const KEY = randomBytes(32)
const AAD = 'id-1|1000|2000|'

describe('vault crypto', () => {
  it('roundtrips plaintext under matching AAD', () => {
    const box = vaultEncrypt(KEY, '{"hello":"bro"}', AAD)
    expect(vaultDecrypt(KEY, box, AAD)).toBe('{"hello":"bro"}')
  })

  it('produces a fresh IV and ciphertext per call', () => {
    const a = vaultEncrypt(KEY, 'same', AAD)
    const b = vaultEncrypt(KEY, 'same', AAD)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
  })

  it('returns null when the AAD (entry metadata) was tampered with', () => {
    const box = vaultEncrypt(KEY, 'payload', AAD)
    // e.g. someone edited expiresAt in localStorage to extend the entry
    expect(vaultDecrypt(KEY, box, 'id-1|1000|999999|')).toBeNull()
  })

  it('returns null for a wrong key or corrupted ciphertext', () => {
    const box = vaultEncrypt(KEY, 'payload', AAD)
    expect(vaultDecrypt(randomBytes(32), box, AAD)).toBeNull()
    const bytes = Buffer.from(box.data, 'base64')
    bytes[0] ^= 0xff
    expect(vaultDecrypt(KEY, { iv: box.iv, data: bytes.toString('base64') }, AAD)).toBeNull()
  })

  it('never emits plaintext in the stored blob', () => {
    const box = vaultEncrypt(KEY, 'super secret diff content', AAD)
    expect(JSON.stringify(box)).not.toContain('super secret')
  })
})
