import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl } from '../../src/main/linkPolicy'

// A URL snippet hands main a URL the user typed. Main still decides what may
// reach the OS: openExternal will happily launch a file, a script handler or
// another application, so the scheme is the fence.
describe('isSafeExternalUrl', () => {
  it('allows ordinary web links', () => {
    for (const url of [
      'https://example.com',
      'http://localhost:3000/path?q=1#frag',
      'https://sub.example.co.uk/a/b',
      'https://example.com/ünïcode'
    ]) {
      expect(isSafeExternalUrl(url), url).toBe(true)
    }
  })

  it('refuses every scheme that is not http(s)', () => {
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'smb://server/share',
      'ftp://example.com/a',
      'mailto:someone@example.com',
      'ms-msdt:/id',
      'x-apple-shortcuts://run'
    ]) {
      expect(isSafeExternalUrl(url), url).toBe(false)
    }
  })

  it('refuses junk, empties and non-strings', () => {
    for (const bad of ['', '   ', 'not a url', '//example.com', undefined, null, 42, {}]) {
      expect(isSafeExternalUrl(bad), String(bad)).toBe(false)
    }
  })

  it('refuses an absurdly long URL rather than handing it to the OS', () => {
    expect(isSafeExternalUrl(`https://example.com/${'a'.repeat(5000)}`)).toBe(false)
  })

  // Scheme parsing is case- and whitespace-insensitive; the fence must be too.
  it('is not fooled by casing or leading whitespace', () => {
    expect(isSafeExternalUrl('  JavaScript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('HTTPS://example.com')).toBe(true)
  })
})
