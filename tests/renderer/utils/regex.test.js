// The regex tester's engine. What matters here is the SEGMENTS: the panel
// renders them through Vue's text interpolation because v-html is banned
// (CLAUDE.md rule 8), so a segment split that loses or duplicates a character
// silently rewrites the reader's own text on screen.
import { describe, expect, it } from 'vitest'
import {
  MAX_MATCHES,
  TIME_BUDGET_MS,
  replaceAll,
  runRegex
} from '../../../src/renderer/src/utils/regex'

const joined = (r) => r.segments.map((s) => s.text).join('')

describe('runRegex', () => {
  it('finds every match, not just the first', () => {
    const r = runRegex('\\d+', [], 'a1 b22 c333')
    expect(r.matches.map((m) => m.text)).toEqual(['1', '22', '333'])
  })

  // The subject is reassembled from the segments on screen. If they ever stop
  // adding up, the reader is looking at text they did not type.
  it('segments always rebuild the subject exactly', () => {
    for (const [pattern, subject] of [
      ['\\d+', 'a1 b22 c333'],
      ['^', 'two\nlines'],
      ['x', 'no matches here'],
      ['.*', 'greedy'],
      ['', 'empty pattern']
    ]) {
      expect(joined(runRegex(pattern, [], subject))).toBe(subject)
    }
  })

  it('marks only the matched segments', () => {
    const r = runRegex('b+', [], 'abba')
    expect(r.segments).toEqual([
      { text: 'a', match: false },
      { text: 'bb', match: true },
      { text: 'a', match: false }
    ])
  })

  it('reports an invalid pattern the way JavaScript does', () => {
    const r = runRegex('(unclosed', [], 'text')
    expect(r.error).toBeTruthy()
    expect(r.matches).toEqual([])
    // The subject is still shown, unhighlighted, rather than blanked.
    expect(joined(r)).toBe('text')
  })

  it('honours the flags it is given', () => {
    expect(runRegex('ABC', [], 'abc').matches).toHaveLength(0)
    expect(runRegex('ABC', ['i'], 'abc').matches).toHaveLength(1)
    expect(runRegex('^b', ['m'], 'a\nb').matches).toHaveLength(1)
  })

  // A zero-width match does not advance lastIndex, so the naive loop spins on
  // it forever — the tester would hang on `^` or `\b`.
  it('does not hang on a zero-width match', () => {
    const r = runRegex('^', ['m'], 'a\nb\nc')
    expect(r.matches).toHaveLength(3)
    expect(joined(r)).toBe('a\nb\nc')
  })

  it('captures numbered and named groups', () => {
    const r = runRegex('(?<y>\\d{4})-(\\d{2})', [], '2026-08')
    expect(r.matches[0].groups).toEqual([
      { name: '1', value: '2026' },
      { name: '2', value: '08' },
      { name: 'y', value: '2026' }
    ])
  })

  it('stops at the match ceiling and says so', () => {
    const r = runRegex('a', [], 'a'.repeat(MAX_MATCHES + 50))
    expect(r.matches).toHaveLength(MAX_MATCHES)
    expect(r.capped).toBe(true)
  })

  // Catastrophic backtracking is a pattern the reader typed, not an attack —
  // but a renderer blocked inside RegExp.exec cannot be interrupted by a timer,
  // a frame, or anything else. The budget is the only way out.
  it('gives up on a pattern that is too slow, rather than hanging', () => {
    let clock = 0
    const r = runRegex('a', [], 'aaaaaaaaaa', { now: () => (clock += TIME_BUDGET_MS) })
    expect(r.truncated).toBe(true)
    expect(joined(r)).toBe('aaaaaaaaaa')
  })
})

describe('replaceAll', () => {
  it('substitutes with $1 and named groups', () => {
    expect(replaceAll('(\\w+)@(\\w+)', [], 'me@here', '$2/$1').output).toBe('here/me')
    expect(replaceAll('(?<n>\\d+)', [], 'x9', '[$<n>]').output).toBe('x[9]')
  })

  it('replaces every occurrence, not just the first', () => {
    expect(replaceAll('a', [], 'aaa', 'b').output).toBe('bbb')
  })

  it('reports an invalid pattern instead of throwing', () => {
    expect(replaceAll('(', [], 'x', 'y').error).toBeTruthy()
  })

  it('is the identity when there is no pattern', () => {
    expect(replaceAll('', [], 'untouched', 'x').output).toBe('untouched')
  })
})
