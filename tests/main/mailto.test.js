import { describe, expect, it } from 'vitest'
import { MAX_MAILTO_LENGTH, buildMailto, fillTemplate, keyMessage } from '../../src/main/mailto'
import { isSafeMailtoUrl } from '../../src/main/linkPolicy'

const ok = (m) => {
  const res = buildMailto(m)
  expect(res.error).toBeUndefined()
  return res.url
}

describe('buildMailto', () => {
  it('addresses one recipient', () => {
    expect(ok({ to: ['ana@example.com'] })).toBe('mailto:ana@example.com')
  })

  it('joins several with a comma', () => {
    expect(ok({ to: ['ana@example.com', 'ruta@example.com'] })).toBe(
      'mailto:ana@example.com,ruta@example.com'
    )
  })

  it('refuses an address that would not pass validation', () => {
    expect(buildMailto({ to: ['a@b.co\r\nBcc: evil@x.com'] })).toEqual({ error: 'bad-address' })
    expect(buildMailto({ to: [] })).toEqual({ error: 'bad-address' })
    expect(buildMailto({ to: ['ana@example.com', 'nope'] })).toEqual({ error: 'bad-address' })
    expect(buildMailto()).toEqual({ error: 'bad-address' })
  })

  // The whole reason the query is built with URLSearchParams: user text must
  // never be able to become a second parameter.
  it('encodes &, ?, # and = in the subject instead of adding a parameter', () => {
    const url = ok({ to: ['a@b.co'], subject: 'a&b?c#d=e' })
    expect(url).toContain('subject=a%26b%3Fc%23d%3De')
    expect([...new URL(url).searchParams.keys()]).toEqual(['subject'])
  })

  it('a note cannot smuggle in an attach parameter', () => {
    const url = ok({ to: ['a@b.co'], body: 'hi&attach=/etc/passwd' })
    expect([...new URL(url).searchParams.keys()]).toEqual(['body'])
    expect(isSafeMailtoUrl(url)).toBe(true)
  })

  it('encodes newlines and unicode in the body', () => {
    const url = ok({ to: ['a@b.co'], body: 'Rūta\nsays hi' })
    expect(new URL(url).searchParams.get('body')).toBe('Rūta\nsays hi')
  })

  it('omits empty parts rather than writing subject=', () => {
    expect(ok({ to: ['a@b.co'], subject: '   ', body: '' })).toBe('mailto:a@b.co')
  })

  it('truncates an over-long body rather than refusing it', () => {
    const url = ok({ to: ['a@b.co'], body: 'x'.repeat(MAX_MAILTO_LENGTH * 2) })
    expect(url.length).toBeLessThanOrEqual(MAX_MAILTO_LENGTH)
  })

  // Reachable through the recipient list, which has no per-message cap of its
  // own — thirty trusted keys with long addresses is a real shape.
  it('refuses a URL past the length cap', () => {
    const many = Array.from({ length: 40 }, (_, i) => `${'r'.repeat(50)}${i}@${'d'.repeat(60)}.com`)
    expect(buildMailto({ to: many })).toEqual({ error: 'too-long' })
  })

  it('always produces something the policy accepts', () => {
    expect(isSafeMailtoUrl(ok({ to: ['a@b.co'], subject: 'Sealed diff: a ↔ b' }))).toBe(true)
  })
})

describe('fillTemplate', () => {
  it('resolves both placeholders', () => {
    expect(
      fillTemplate({ template: 'Sealed diff: {name} ({expires})', name: 'x', expires: 'Wed' })
    ).toBe('Sealed diff: x (Wed)')
  })

  it('replaces every occurrence, not just the first', () => {
    expect(fillTemplate({ template: '{name} {name}', name: 'a' })).toBe('a a')
  })

  it('blanks an unknown placeholder rather than leaving the braces', () => {
    expect(fillTemplate({ template: '{name}', name: undefined })).toBe('')
  })

  it('strips control characters a diff name could carry', () => {
    expect(fillTemplate({ template: '{name}', name: 'a\r\nBcc: x@y.co' })).toBe('a Bcc: x@y.co')
  })
})

// The key hand-off opens an UNADDRESSED draft: the key goes precisely to
// someone not yet in the trust store, so there is no address to resolve.
describe('buildMailto — recipient-less', () => {
  it('refuses an empty recipient list by default, as ever', () => {
    expect(buildMailto({ to: [], subject: 'x' })).toEqual({ error: 'bad-address' })
  })

  it('builds an address-less draft only on explicit opt-in', () => {
    const built = buildMailto({ to: [], subject: 'My key', allowEmptyTo: true })
    expect(built.ok).toBe(true)
    expect(built.url).toBe('mailto:?subject=My%20key')
  })

  it('a recipient still rides along when one is given', () => {
    const built = buildMailto({ to: ['ana@example.com'], subject: 'k', allowEmptyTo: true })
    expect(built.url.startsWith('mailto:ana@example.com?')).toBe(true)
  })

  it('a malformed address is refused even with the opt-in', () => {
    expect(buildMailto({ to: ['not-an-email'], allowEmptyTo: true })).toEqual({
      error: 'bad-address'
    })
  })
})

describe('keyMessage', () => {
  it('carries the label in the subject and the fingerprint + import path in the body', () => {
    const msg = keyMessage({ label: 'Ana laptop', fingerprint: 'ab12cd34' })
    expect(msg.subject).toContain('Ana laptop')
    expect(msg.body).toContain('ab12cd34')
    expect(msg.body).toMatch(/Add Trusted Key/i)
  })

  it('a hostile label cannot smuggle headers into the subject', () => {
    // headerText flattens the CRLF a header injection needs; the leftover
    // words are inert text inside an encoded subject value.
    const msg = keyMessage({ label: 'x\r\nBcc: a@b.c', fingerprint: 'f' })
    expect(msg.subject).not.toMatch(/[\r\n\u0000-\u001f]/) // eslint-disable-line no-control-regex
    const built = buildMailto({ to: [], subject: msg.subject, allowEmptyTo: true })
    expect(built.url).not.toMatch(/%0d|%0a/i)
  })

  it('stays sane without a label', () => {
    const msg = keyMessage({ label: '', fingerprint: 'ab12' })
    expect(msg.subject.length).toBeGreaterThan(0)
    expect(msg.body).toContain('ab12')
  })
})
