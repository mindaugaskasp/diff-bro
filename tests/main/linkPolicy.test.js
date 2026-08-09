import { describe, it, expect } from 'vitest'
import { isClaudeUrl, isSafeMailtoUrl } from '../../src/main/linkPolicy'

describe('isClaudeUrl — the claude.ai open allowlist', () => {
  it('accepts claude.ai and its subdomains over https', () => {
    for (const url of [
      'https://claude.ai',
      'https://claude.ai/',
      'https://claude.ai/artifacts/abc-123',
      'https://www.claude.ai/chat/xyz',
      'https://app.claude.ai/foo?bar=1#frag'
    ]) {
      expect(isClaudeUrl(url)).toBe(true)
    }
  })

  it('rejects look-alike hosts and userinfo tricks', () => {
    for (const url of [
      'https://claude.ai.evil.com/x', // suffix attack
      'https://notclaude.ai/x', // no dot boundary
      'https://evil-claude.ai.attacker.com', // deep suffix
      'https://claude.ai@evil.com', // userinfo, real host is evil.com
      'https://evil.com/https://claude.ai', // path, not host
      'https://xn--claude.ai' // punycode look-alike
    ]) {
      expect(isClaudeUrl(url)).toBe(false)
    }
  })

  it('rejects non-https schemes and junk', () => {
    for (const url of [
      'http://claude.ai', // not https
      'ftp://claude.ai',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'claude.ai', // no scheme → not a valid URL
      '',
      null,
      undefined,
      42
    ]) {
      expect(isClaudeUrl(url)).toBe(false)
    }
  })
})

describe('isSafeMailtoUrl — the mail hand-off fence', () => {
  it('accepts a mailto: with recipients, subject and body', () => {
    expect(isSafeMailtoUrl('mailto:a@b.co')).toBe(true)
    expect(isSafeMailtoUrl('mailto:a@b.co,c@d.co?subject=Hi&body=There')).toBe(true)
    // Percent-encoded is still legal, and a hand-edited URL may arrive that way.
    expect(isSafeMailtoUrl('mailto:a%40b.co')).toBe(true)
  })

  // `attach` is refused, not ignored: some clients once honoured it, which
  // turns a mailto: into "read this local file and send it".
  it('rejects an attach parameter in any casing', () => {
    expect(isSafeMailtoUrl('mailto:a@b.co?attach=/etc/passwd')).toBe(false)
    expect(isSafeMailtoUrl('mailto:a@b.co?ATTACH=/etc/passwd')).toBe(false)
    expect(isSafeMailtoUrl('mailto:a@b.co?attachment=/etc/passwd')).toBe(false)
    expect(isSafeMailtoUrl('mailto:a@b.co?subject=Hi&attach=~/.ssh/id_rsa')).toBe(false)
  })

  it('rejects every scheme but mailto:', () => {
    for (const url of [
      'https://example.com',
      'http://example.com',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'mailto',
      'a@b.co',
      '',
      null,
      undefined,
      42
    ]) {
      expect(isSafeMailtoUrl(url), String(url)).toBe(false)
    }
  })

  it('rejects a malformed percent-escape rather than handing it to the OS', () => {
    expect(isSafeMailtoUrl('mailto:a%ZZb.co')).toBe(false)
  })

  it('rejects a mailto: with no addressee', () => {
    expect(isSafeMailtoUrl('mailto:')).toBe(false)
    expect(isSafeMailtoUrl('mailto:?subject=Hi')).toBe(false)
  })

  it('rejects embedded control characters', () => {
    expect(isSafeMailtoUrl('mailto:a@b.co?subject=Hi\r\nBcc: x')).toBe(false)
  })

  it('rejects an over-long URL', () => {
    expect(isSafeMailtoUrl(`mailto:a@b.co?body=${'x'.repeat(5000)}`)).toBe(false)
  })
})

// The key hand-off's draft has no addressee at all — allowed only on the
// caller's explicit say-so, and none of the other refusals soften with it.
describe('isSafeMailtoUrl — recipient-less opt-in', () => {
  it('refuses an address-less mailto by default', () => {
    expect(isSafeMailtoUrl('mailto:?subject=Key')).toBe(false)
  })

  it('accepts one only with allowEmptyAddressee', () => {
    expect(isSafeMailtoUrl('mailto:?subject=Key', { allowEmptyAddressee: true })).toBe(true)
  })

  it('still refuses attach with the opt-in', () => {
    expect(isSafeMailtoUrl('mailto:?attach=/etc/passwd', { allowEmptyAddressee: true })).toBe(false)
  })

  it('a non-empty, non-address path stays refused with the opt-in', () => {
    expect(isSafeMailtoUrl('mailto:garbage?subject=k', { allowEmptyAddressee: true })).toBe(false)
  })

  it('an addressed url passes with the flag exactly as without', () => {
    expect(isSafeMailtoUrl('mailto:a@b.se?subject=k', { allowEmptyAddressee: true })).toBe(true)
  })
})
