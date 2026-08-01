import { describe, expect, it } from 'vitest'
import { redactHome, redactSensitive } from '../../src/main/logRedact'

const scrub = (text, homeDir = '/Users/jane') => redactSensitive(text, { homeDir })

describe('redactHome', () => {
  it('replaces every occurrence of the home path with ~', () => {
    const text = '/Users/jane/Docs/a.bin and /Users/jane/b'
    expect(redactHome(text, '/Users/jane')).toBe('~/Docs/a.bin and ~/b')
  })
  it('is a no-op without a home dir', () => {
    expect(redactHome('untouched', '')).toBe('untouched')
  })
})

describe('redactSensitive — document paths', () => {
  it('drops the directories and the filename stem, keeping the extension', () => {
    expect(scrub('failed to parse /Users/jane/Clients/Acme/payroll-q3.xlsx')).toBe(
      'failed to parse ~/…/<file>.xlsx'
    )
  })

  it('collapses a path outside the home dir too', () => {
    expect(scrub('/Volumes/Acme Work/2026 merger/targets.csv')).toBe('/…/<file>.csv')
  })

  it('collapses a Windows path, keeping the drive', () => {
    expect(scrub('C:\\Users\\bob\\Desktop\\Payroll.XLSX')).toBe('C:\\…\\<file>.XLSX')
  })

  it('redacts a bare filename with no directory', () => {
    expect(scrub('cannot open severance-agreement.docx')).toBe(
      'cannot open severance-agreement.docx'
    )
    expect(scrub('cannot open severance-agreement.json')).toBe('cannot open <file>.json')
  })

  it('covers every format the app opens, plus its own file types', () => {
    for (const ext of [
      'xlsx',
      'csv',
      'tsv',
      'json',
      'jsonc',
      'yaml',
      'yml',
      'xml',
      'svg',
      'md',
      'mdx',
      'txt',
      'diffbro',
      'diffbrokey'
    ]) {
      expect(scrub(`~/secret-project/notes.${ext}`)).toBe(`~/…/<file>.${ext}`)
    }
  })

  it('keeps the root separator for a file with no directory above it', () => {
    expect(scrub('/scratch.csv')).toBe('/<file>.csv')
  })

  it('leaves stack-trace source paths intact so a trace stays useful', () => {
    const stack = 'Error: boom\n    at parse (/Applications/Diff Bro.app/out/main/index.js:42:9)'
    expect(scrub(stack)).toBe(stack)
  })

  it('survives a path inside parentheses without eating the punctuation', () => {
    expect(scrub('at load (/Users/jane/data/in.csv:1:1)')).toBe('at load (~/…/<file>.csv:1:1)')
  })
})

describe('redactSensitive — identity', () => {
  it('anonymises another account home on macOS, Linux and Windows', () => {
    expect(scrub('/Users/bob/Library/Caches')).toBe('/Users/<user>/Library/Caches')
    expect(scrub('/home/bob/.config')).toBe('/home/<user>/.config')
    expect(scrub('C:\\Users\\bob\\AppData')).toBe('C:\\Users\\<user>\\AppData')
  })

  it('anonymises a UNC host and share', () => {
    expect(scrub('\\\\fileserver01\\finance\\q3')).toBe('\\\\<host>\\<share>\\q3')
  })

  it('redacts email addresses', () => {
    expect(scrub('signed by jane.doe@acme-corp.com ok')).toBe('signed by <email> ok')
  })

  it('redacts IPv4 addresses', () => {
    expect(scrub('host 192.168.1.44 refused')).toBe('host <ip> refused')
  })
})

describe('redactSensitive — secrets and URLs', () => {
  it('keeps a URL origin but drops the path, query and fragment', () => {
    expect(scrub('opened https://claude.ai/chat/abc?token=s3cret#x')).toBe(
      'opened https://claude.ai/<path>'
    )
  })

  it('redacts a long hex run (fingerprints, digests) but reports its length', () => {
    expect(scrub(`fp ${'a1b2c3d4'.repeat(8)} bad`)).toBe('fp <hex:64> bad')
  })

  it('redacts a long base64-ish run', () => {
    const blob = 'QUJDRGVmZ2hpSktMbW5vcFFSU3R1dld4eXoxMjM0NTY3ODkw'
    expect(scrub(`key ${blob} bad`)).toBe(`key <b64:${blob.length}> bad`)
  })

  it('leaves short hex and ordinary words alone', () => {
    expect(scrub('code deadbeef at chunk index-a1b2c3d4.js')).toBe(
      'code deadbeef at chunk index-a1b2c3d4.js'
    )
  })

  it('does not mistake a long lowercase path segment for base64', () => {
    const text = '/opt/homebrew/lib/node_modules/some/deeply/nested/module/entry.js'
    expect(scrub(text)).toBe(text)
  })
})

describe('redactSensitive — robustness', () => {
  it('handles empty and non-string input without throwing', () => {
    expect(scrub('')).toBe('')
    expect(redactSensitive(undefined, {})).toBe('')
    expect(redactSensitive(null, {})).toBe('')
  })

  it('works with no options at all', () => {
    expect(redactSensitive('plain text')).toBe('plain text')
  })

  it('is idempotent — re-running never re-redacts its own markers', () => {
    const once = scrub('/Users/jane/Docs/a.xlsx mailed to x@y.com from 10.0.0.1')
    expect(scrub(once)).toBe(once)
  })
})
