import { describe, expect, it } from 'vitest'
import { textAdapter } from '../src/renderer/src/adapters/textAdapter'
import { resolveAdapter } from '../src/renderer/src/adapters'

describe('textAdapter', () => {
  it('is the fallback for every file', () => {
    expect(resolveAdapter({ name: 'anything.xyz' })).toBe(textAdapter)
  })

  it('maps known extensions to Monaco languages', () => {
    expect(textAdapter.toComparable({ name: 'a.ts', content: '' }).language).toBe('typescript')
    expect(textAdapter.toComparable({ name: 'b.py', content: '' }).language).toBe('python')
    expect(textAdapter.toComparable({ name: 'c.tar.json', content: '' }).language).toBe('json')
  })

  it('falls back to plaintext for unknown or missing extensions', () => {
    expect(textAdapter.toComparable({ name: 'noext', content: '' }).language).toBe('plaintext')
    expect(textAdapter.toComparable({ name: 'weird.zzz', content: '' }).language).toBe('plaintext')
  })

  it('passes content through untouched', () => {
    const out = textAdapter.toComparable({ name: 'a.js', content: 'const x = 1' })
    expect(out).toEqual({ kind: 'text', text: 'const x = 1', language: 'javascript' })
  })
})
