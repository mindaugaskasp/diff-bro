import { describe, expect, it } from 'vitest'
import {
  SECRET_MASK,
  SECRET_NOTICE,
  isSecret,
  previewText
} from '../../../src/renderer/src/utils/secretSnippet'

describe('isSecret', () => {
  it('is true only for the explicit flag', () => {
    expect(isSecret({ secret: true })).toBe(true)
    expect(isSecret({ secret: false })).toBe(false)
    expect(isSecret({})).toBe(false)
    expect(isSecret(undefined)).toBe(false)
  })

  // A hand-edited store could carry anything; only `true` hides, and only `true`
  // reveals, so neither a truthy string nor a missing field can flip it.
  it('does not treat a truthy non-boolean as secret', () => {
    expect(isSecret({ secret: 'yes' })).toBe(false)
    expect(isSecret({ secret: 1 })).toBe(false)
  })
})

describe('previewText', () => {
  it('masks a secret entry, whatever it was handed', () => {
    expect(previewText({ secret: true }, 'sk-live-abcdef')).toBe(SECRET_MASK)
    expect(previewText({ secret: true })).toBe(SECRET_MASK)
  })

  it('passes an ordinary snippet through untouched', () => {
    expect(previewText({ secret: false }, 'const a = 1')).toBe('const a = 1')
    expect(previewText({}, '')).toBe('')
    expect(previewText({}, undefined)).toBe('')
  })

  // The whole point: a glance must not reveal how long the secret is.
  it('is the same width for every secret, however long', () => {
    const short = previewText({ secret: true }, '1234')
    const long = previewText({ secret: true }, 'x'.repeat(4096))
    expect(short).toBe(long)
    expect(SECRET_MASK).not.toContain('1')
  })

  it('never leaks a character of the secret', () => {
    const secret = 'sk-live-DEADBEEF'
    const shown = previewText({ secret: true }, secret)
    for (const ch of new Set(secret.replace(/\*/g, ''))) expect(shown).not.toContain(ch)
  })
})

describe('the notice', () => {
  // States the fact (it is hidden, copying still works) without re-selling the
  // encryption behind it — see the UI-copy rule in docs/standards.md.
  it('says it is hidden and that copying still works', () => {
    expect(SECRET_NOTICE).toMatch(/hidden/i)
    expect(SECRET_NOTICE).toMatch(/copy/i)
  })

  it('stays short enough for the compact hover card', () => {
    expect(SECRET_NOTICE.length).toBeLessThan(60)
  })
})
