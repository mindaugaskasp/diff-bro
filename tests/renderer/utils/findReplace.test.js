import { describe, expect, it } from 'vitest'
import { replaceText } from '../../../src/renderer/src/utils/findReplace'

describe('replaceText', () => {
  it('replaces literal substrings and counts them', () => {
    const r = replaceText({ text: 'a.b.c', find: '.', replace: '-', mode: 'text' })
    expect(r.output).toBe('a-b-c')
    expect(r.count).toBe(2)
  })

  it('treats the find as literal in text mode (no regex metachars)', () => {
    const r = replaceText({ text: 'a+b', find: 'a+b', replace: 'x', mode: 'text' })
    expect(r.output).toBe('x')
    expect(r.count).toBe(1)
  })

  it('keeps $-sequences literal in the replacement for text mode', () => {
    const r = replaceText({ text: 'price', find: 'price', replace: '$1.00', mode: 'text' })
    expect(r.output).toBe('$1.00')
  })

  it('matches only whole words in word mode', () => {
    const r = replaceText({ text: 'cat category cat', find: 'cat', replace: 'dog', mode: 'word' })
    expect(r.output).toBe('dog category dog')
    expect(r.count).toBe(2)
  })

  it('supports regex with backreferences', () => {
    const r = replaceText({ text: 'John Smith', find: '(\\w+) (\\w+)', replace: '$2 $1', mode: 'regex' })
    expect(r.output).toBe('Smith John')
    expect(r.count).toBe(1)
  })

  it('honours the case-insensitive flag', () => {
    const r = replaceText({ text: 'Foo foo FOO', find: 'foo', replace: 'x', caseInsensitive: true })
    expect(r.output).toBe('x x x')
    expect(r.count).toBe(3)
  })

  it('is case-sensitive by default', () => {
    const r = replaceText({ text: 'Foo foo', find: 'foo', replace: 'x' })
    expect(r.output).toBe('Foo x')
    expect(r.count).toBe(1)
  })

  it('reports an error for an invalid regex without mutating text', () => {
    const r = replaceText({ text: 'abc', find: '(', replace: 'x', mode: 'regex' })
    expect(r.error).toMatch(/Invalid regular expression/)
    expect(r.output).toBe('abc')
    expect(r.count).toBe(0)
  })

  it('returns the text unchanged when find is empty', () => {
    const r = replaceText({ text: 'abc', find: '', replace: 'x' })
    expect(r.output).toBe('abc')
    expect(r.count).toBe(0)
  })
})
