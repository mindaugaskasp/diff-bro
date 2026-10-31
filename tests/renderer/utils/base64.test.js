import { describe, expect, it } from 'vitest'
import {
  base64Decode,
  base64DecodeParts,
  base64Encode,
  byteLength
} from '../../../src/renderer/src/utils/base64'

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

describe('base64DecodeParts', () => {
  const hello = base64Encode('hello world')

  it('decodes the Base64 inside mixed text and keeps the rest byte for byte', () => {
    expect(base64DecodeParts(`token:  ${hello}\n  end!`)).toBe('token:  hello world\n  end!')
  })

  it('decodes every part it finds', () => {
    const notes = base64Encode('release notes')
    expect(base64DecodeParts(`a ${hello} b ${notes} c`)).toBe('a hello world b release notes c')
  })

  it('reads URL-safe and unpadded parts', () => {
    const safe = base64Encode('hello>>> world', { urlSafe: true })
    expect(base64DecodeParts(`id ${safe} ok`)).toBe('id hello>>> world ok')
  })

  it('still decodes a whole input, wrapped or short', () => {
    expect(base64DecodeParts('aGVs\nbG8=')).toBe('hello')
    expect(base64DecodeParts('aGVsbG8')).toBe('hello')
  })

  it('leaves ordinary words and paths alone around a part', () => {
    const prose = 'Something important about /usr/local/bin and pre-commit-hooks'
    expect(base64DecodeParts(`${prose} ${hello}`)).toBe(`${prose} hello world`)
  })

  it('leaves a run whose bytes are not printable text', () => {
    const binary = btoa(String.fromCharCode(0, 1, 2, 3, 4, 5, 6, 7))
    expect(base64DecodeParts(`${binary} ${hello}`)).toBe(`${binary} hello world`)
  })

  it('throws when nothing decodes, so the tool can say so', () => {
    expect(() => base64DecodeParts('plain words only, nothing encoded!')).toThrow()
  })
})

describe('byteLength', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(byteLength('abc')).toBe(3)
    expect(byteLength('€')).toBe(3)
    expect(byteLength('')).toBe(0)
  })
})
