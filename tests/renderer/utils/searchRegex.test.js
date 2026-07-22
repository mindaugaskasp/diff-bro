import { describe, expect, it } from 'vitest'
import { checkRegex, MAX_REGEX_LENGTH } from '../../../src/renderer/src/utils/searchRegex'

describe('checkRegex', () => {
  it('accepts ordinary patterns, including harmlessly quantified groups', () => {
    expect(checkRegex('foo').ok).toBe(true)
    expect(checkRegex('\\d{3}-\\d{4}').ok).toBe(true)
    expect(checkRegex('(abc)+').ok).toBe(true)
    expect(checkRegex('[a-z]+').ok).toBe(true)
  })

  it('does not mistake a quantified character class for a nested quantifier', () => {
    // A '*'/'+' before ']' is a literal inside the class, so these are linear.
    expect(checkRegex('[-+]+').ok).toBe(true)
    expect(checkRegex('[ab*]+').ok).toBe(true)
    expect(checkRegex('[/*]+').ok).toBe(true)
  })

  it('rejects an empty pattern', () => {
    expect(checkRegex('')).toEqual({ ok: false, error: 'empty' })
    expect(checkRegex(null).ok).toBe(false)
  })

  it('rejects an over-long pattern', () => {
    const res = checkRegex('a'.repeat(MAX_REGEX_LENGTH + 1))
    expect(res).toEqual({ ok: false, error: 'too-long' })
  })

  it('rejects catastrophic nested quantifiers', () => {
    expect(checkRegex('(a+)+').error).toBe('nested-quantifier')
    expect(checkRegex('(a*)*').error).toBe('nested-quantifier')
    expect(checkRegex('(\\d+){2,}').error).toBe('nested-quantifier')
  })

  it('rejects syntactically invalid patterns', () => {
    expect(checkRegex('(unclosed').error).toBe('invalid')
    expect(checkRegex('[z-a]').error).toBe('invalid')
  })
})
