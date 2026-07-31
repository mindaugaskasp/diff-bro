import { describe, expect, it } from 'vitest'
import { base64Decode, base64Encode, byteLength } from '../../../src/renderer/src/utils/base64'

describe('base64Encode / base64Decode', () => {
  it('round-trips plain ASCII text', () => {
    expect(base64Decode(base64Encode('hello world'))).toBe('hello world')
  })

  it('round-trips unicode text', () => {
    const text = '日本語 — emoji 🎉 café'
    expect(base64Decode(base64Encode(text))).toBe(text)
  })

  it('round-trips empty string', () => {
    expect(base64Decode(base64Encode(''))).toBe('')
  })

  it('produces standard Base64 output', () => {
    expect(base64Encode('hello')).toBe('aGVsbG8=')
  })

  it('throws on invalid Base64 input', () => {
    expect(() => base64Decode('not-valid-base64!!!')).toThrow()
  })

  it('swaps +/ for -_ and strips padding in URL-safe mode', () => {
    expect(base64Encode('>>>')).toBe('Pj4+') // standard alphabet uses '+'
    expect(base64Encode('>>>', { urlSafe: true })).toBe('Pj4-')
    expect(base64Encode('hello', { urlSafe: true })).toBe('aGVsbG8') // '=' stripped
  })

  it('decodes URL-safe, unpadded input', () => {
    expect(base64Decode('Pj4-')).toBe('>>>')
    expect(base64Decode('aGVsbG8')).toBe('hello')
  })

  it('wraps encoded output at 76 columns', () => {
    const wrapped = base64Encode('x'.repeat(120), { wrap: true })
    const lines = wrapped.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toHaveLength(76)
    expect(base64Decode(wrapped)).toBe('x'.repeat(120))
  })

  it('tolerates whitespace and newlines on decode', () => {
    expect(base64Decode('aGVs\nbG8 =')).toBe('hello')
  })
})

describe('byteLength', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(byteLength('abc')).toBe(3)
    expect(byteLength('€')).toBe(3)
    expect(byteLength('')).toBe(0)
  })
})
