import { describe, expect, it } from 'vitest'
import {
  formatLogEntry,
  dailyLogName,
  isLogFileName,
  redactHome,
  capLog,
  staleLogFiles
} from '../../src/main/logFormat'

const AT = new Date('2026-07-23T10:20:30.000Z')

describe('formatLogEntry', () => {
  it('formats a one-line, timestamped, source-tagged head with an indented stack', () => {
    const out = formatLogEntry(
      { source: 'renderer', message: 'Boom happened', stack: 'Error: Boom\n at foo (a.js:1)' },
      AT
    )
    expect(out).toMatch(/^\[2026-07-23T10:20:30\.000Z\] \[renderer\] Boom happened\n/)
    expect(out).toContain('\n    Error: Boom')
    expect(out.endsWith('\n')).toBe(true)
  })

  it('collapses newlines in the message so entries stay greppable', () => {
    const out = formatLogEntry({ message: 'line one\nline two' }, AT)
    expect(out.split('\n')[0]).toBe('[2026-07-23T10:20:30.000Z] [app] line one line two')
  })

  it('truncates an enormous message and stack instead of rejecting them', () => {
    const out = formatLogEntry({ message: 'x'.repeat(10_000), stack: 'y'.repeat(50_000) }, AT)
    expect(out).toContain('…(truncated)')
    expect(out.length).toBeLessThan(25_000)
  })

  it('includes context and env when present', () => {
    const out = formatLogEntry(
      { message: 'm', context: 'window.onerror', appVersion: '0.1.0', platform: 'darwin' },
      AT
    )
    expect(out).toContain('context: window.onerror')
    expect(out).toContain('env: 0.1.0 darwin')
  })
})

describe('dailyLogName / isLogFileName', () => {
  it('names one file per calendar day', () => {
    expect(dailyLogName(new Date(2026, 6, 5))).toBe('diffbro-2026-07-05.log')
  })
  it('recognises its own files and rejects others', () => {
    expect(isLogFileName('diffbro-2026-07-05.log')).toBe(true)
    expect(isLogFileName('vault.key')).toBe(false)
    expect(isLogFileName('diffbro-2026-07-05.txt')).toBe(false)
  })
})

describe('redactHome', () => {
  it('replaces every occurrence of the home path with ~', () => {
    const text = '/Users/jane/Docs/a.txt and /Users/jane/b'
    expect(redactHome(text, '/Users/jane')).toBe('~/Docs/a.txt and ~/b')
  })
  it('is a no-op without a home dir', () => {
    expect(redactHome('untouched', '')).toBe('untouched')
  })
})

describe('capLog', () => {
  const entry = (n) => `[t${n}] msg${n}\n`
  it('appends when under the cap', () => {
    expect(capLog(entry(1), entry(2), 1000)).toBe(entry(1) + entry(2))
  })
  it('drops whole oldest entries to fit, never splitting one', () => {
    const existing = entry(1) + entry(2) + entry(3)
    const out = capLog(existing, entry(4), entry(1).length * 2 + 1)
    expect(out).not.toContain('msg1')
    expect(out).toContain('msg4')
    // Every retained line is a complete entry head or body.
    expect(out.startsWith('[')).toBe(true)
  })
  it('keeps a single oversized entry rather than emptying the file', () => {
    const big = `[t] ${'z'.repeat(100)}\n`
    expect(capLog('', big, 10)).toBe(big)
  })
})

describe('staleLogFiles', () => {
  it('returns the oldest daily files beyond the retention window', () => {
    const names = [
      'diffbro-2026-07-20.log',
      'diffbro-2026-07-21.log',
      'diffbro-2026-07-22.log',
      'diffbro-2026-07-23.log',
      'other.txt'
    ]
    expect(staleLogFiles(names, 2)).toEqual(['diffbro-2026-07-20.log', 'diffbro-2026-07-21.log'])
  })
  it('keeps everything when within the window and never touches non-log files', () => {
    expect(staleLogFiles(['diffbro-2026-07-23.log', 'vault.key'], 7)).toEqual([])
  })
})
