import { describe, expect, it } from 'vitest'
import { base64Decode, base64Encode } from '../../../src/renderer/src/utils/base64'

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
})
