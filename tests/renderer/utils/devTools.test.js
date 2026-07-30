import { describe, expect, it } from 'vitest'
import {
  convertEpoch,
  convertUrlCode,
  decodeJwt,
  validateEpoch,
  validateJwt,
  validateUrlCode
} from '../../../src/renderer/src/utils/devTools'

// The canonical jwt.io example (HS256).
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ' +
  '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('JWT decode', () => {
  it('accepts a well-formed three-part token', () => {
    expect(validateJwt(JWT).valid).toBe(true)
  })

  it('rejects a token without three parts', () => {
    expect(validateJwt('a.b')).toEqual({
      valid: false,
      error: 'a JWT has three dot-separated parts'
    })
  })

  it('rejects three parts that are not base64url JSON', () => {
    expect(validateJwt('a.b.c').valid).toBe(false)
  })

  it('decodes header and payload into one JSON object', () => {
    const out = decodeJwt(JWT)
    expect(out).toContain('"alg": "HS256"')
    expect(out).toContain('"name": "John Doe"')
    expect(JSON.parse(out)).toHaveProperty('payload.sub', '1234567890')
  })

  it('returns the input unchanged when it cannot decode', () => {
    expect(decodeJwt('abc')).toBe('abc') // fewer than two parts
    expect(decodeJwt('a.b.c')).toBe('a.b.c') // parts are not JSON
  })
})

describe('epoch ↔ date', () => {
  it('reads 10-digit seconds and 13-digit milliseconds the same', () => {
    expect(convertEpoch('1700000000')).toBe('2023-11-14T22:13:20.000Z')
    expect(convertEpoch('1700000000000')).toBe('2023-11-14T22:13:20.000Z')
    expect(convertEpoch('0')).toBe('1970-01-01T00:00:00.000Z')
  })

  it('converts a parseable date back to Unix seconds', () => {
    expect(convertEpoch('2023-11-14T22:13:20.000Z')).toBe('1700000000')
  })

  it('validates timestamps and dates, rejects the rest', () => {
    expect(validateEpoch('1700000000').valid).toBe(true)
    expect(validateEpoch('2023-01-01').valid).toBe(true)
    expect(validateEpoch('not a date')).toEqual({
      valid: false,
      error: 'not a Unix timestamp or a parseable date'
    })
  })

  it('leaves unparseable input untouched', () => {
    expect(convertEpoch('not a date')).toBe('not a date')
  })
})

describe('URL encode / decode', () => {
  it('encodes when there is no percent-encoding', () => {
    expect(convertUrlCode('a b&c')).toBe('a%20b%26c')
    expect(validateUrlCode('a b&c').valid).toBe(true)
  })

  it('decodes percent-encoded input', () => {
    expect(convertUrlCode('a%20b%26c')).toBe('a b&c')
  })

  it('flags and survives malformed percent-encoding', () => {
    expect(validateUrlCode('%C3%28')).toEqual({ valid: false, error: 'malformed percent-encoding' })
    expect(convertUrlCode('%C3%28')).toBe('%C3%28')
  })
})
