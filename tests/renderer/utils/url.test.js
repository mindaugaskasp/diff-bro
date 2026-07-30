import { describe, it, expect } from 'vitest'
import { encodeUrl, decodeUrl, parseQuery, buildQuery } from '../../../src/renderer/src/utils/url'

describe('encodeUrl / decodeUrl', () => {
  it('component escapes everything; full-URI keeps the delimiters', () => {
    expect(encodeUrl('a b/c?d', { component: true })).toBe('a%20b%2Fc%3Fd')
    expect(encodeUrl('a b/c?d', { component: false })).toBe('a%20b/c?d')
  })

  it('decodes both ways and reports malformed input as empty', () => {
    expect(decodeUrl('a%20b%2Fc', { component: true })).toBe('a b/c')
    expect(decodeUrl('%2Fpath', { component: false })).toBe('%2Fpath') // decodeURI keeps %2F
    expect(decodeUrl('%zz', { component: true })).toBe('')
  })
})

describe('parseQuery', () => {
  it('breaks out decoded key/value pairs and drops the fragment', () => {
    const { base, params } = parseQuery('https://x.io/p?q=hello%20world&utm=a+b#frag')
    expect(base).toBe('https://x.io/p')
    expect(params).toEqual([
      { key: 'q', value: 'hello world' },
      { key: 'utm', value: 'a b' }
    ])
  })

  it('handles a bare key and a URL with no query', () => {
    expect(parseQuery('https://x.io?flag').params).toEqual([{ key: 'flag', value: '' }])
    expect(parseQuery('https://x.io/p')).toEqual({ base: 'https://x.io/p', params: [] })
  })
})

describe('buildQuery', () => {
  it('re-encodes the params and drops empty rows', () => {
    const out = buildQuery('https://x.io/p', [
      { key: 'q', value: 'hello world' },
      { key: 'a', value: 'b&c' },
      { key: '', value: '' }
    ])
    expect(out).toBe('https://x.io/p?q=hello%20world&a=b%26c')
  })

  it('round-trips through parseQuery', () => {
    const url = 'https://x.io/p?q=a%20b&n=1'
    const { base, params } = parseQuery(url)
    expect(buildQuery(base, params)).toBe(url)
  })

  it('returns just the base when there are no active params', () => {
    expect(buildQuery('https://x.io', [{ key: '', value: '' }])).toBe('https://x.io')
  })
})
