import { describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { SCRYPT_PARAMS, deriveKey, scryptParamsFor } from '../../src/main/kdf'

describe('scryptParamsFor', () => {
  it('falls back to legacy defaults when no kdf field is present (old files)', () => {
    expect(scryptParamsFor({})).toEqual({ N: 2 ** 14, r: 8, p: 1 })
    expect(scryptParamsFor({ kdf: undefined })).toEqual({ N: 2 ** 14, r: 8, p: 1 })
  })

  it('returns the embedded params when they are valid and in-bounds', () => {
    expect(scryptParamsFor({ kdf: { N: 2 ** 17, r: 8, p: 1 } })).toEqual({ N: 2 ** 17, r: 8, p: 1 })
  })

  it('rejects malformed or out-of-bounds params with null (no attacker-chosen cost)', () => {
    expect(scryptParamsFor({ kdf: 'nope' })).toBeNull()
    expect(scryptParamsFor({ kdf: { N: 3, r: 8, p: 1 } })).toBeNull() // not a power of two
    expect(scryptParamsFor({ kdf: { N: 2 ** 30, r: 8, p: 1 } })).toBeNull() // exceeds cap
    expect(scryptParamsFor({ kdf: { N: 2 ** 17, r: 0, p: 1 } })).toBeNull()
    expect(scryptParamsFor({ kdf: { N: 2 ** 17, r: 8, p: 99 } })).toBeNull()
  })
})

describe('deriveKey', () => {
  it('is deterministic for the same passphrase/salt/params', async () => {
    const salt = randomBytes(16)
    const a = await deriveKey('pw', salt)
    const b = await deriveKey('pw', salt)
    expect(a.equals(b)).toBe(true)
    expect(a).toHaveLength(32)
  })

  it('differs when the cost params differ (so params must travel with the file)', async () => {
    const salt = randomBytes(16)
    const strong = await deriveKey('pw', salt, SCRYPT_PARAMS)
    const legacy = await deriveKey('pw', salt, { N: 2 ** 14, r: 8, p: 1 })
    expect(strong.equals(legacy)).toBe(false)
  })
})
