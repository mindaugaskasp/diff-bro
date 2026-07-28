import { describe, it, expect } from 'vitest'
import { isClaudeUrl } from '../../src/main/linkPolicy'

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
