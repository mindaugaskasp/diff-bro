import { describe, expect, it } from 'vitest'
import {
  composeMerge,
  conflictCount,
  parseConflicts,
  unresolvedCount
} from '../../../src/renderer/src/utils/mergeConflicts'

const FILE = [
  'top',
  '<<<<<<< HEAD',
  'ours one',
  'ours two',
  '=======',
  'theirs one',
  '>>>>>>> feature',
  'bottom'
].join('\n')

const DIFF3 = [
  '<<<<<<< HEAD',
  'ours',
  '||||||| merged common ancestors',
  'base',
  '=======',
  'theirs',
  '>>>>>>> feature'
].join('\n')

describe('parseConflicts', () => {
  it('splits a file into stable text and the conflicts between it', () => {
    const parsed = parseConflicts(FILE)
    expect(parsed.segments.map((s) => s.type)).toEqual(['stable', 'conflict', 'stable'])
    expect(parsed.segments[0].lines).toEqual(['top'])
    expect(parsed.segments[2].lines).toEqual(['bottom'])
  })

  it('reads both sides of a conflict, and what each was called', () => {
    const [, conflict] = parseConflicts(FILE).segments
    expect(conflict.ours).toEqual(['ours one', 'ours two'])
    expect(conflict.theirs).toEqual(['theirs one'])
    expect(conflict.oursLabel).toBe('HEAD')
    expect(conflict.theirsLabel).toBe('feature')
  })

  // diff3 style adds the common ancestor, which is the only thing that says
  // WHICH side changed.
  it('reads the base section when the file carries one', () => {
    const [conflict] = parseConflicts(DIFF3).segments
    expect(conflict.base).toEqual(['base'])
    expect(conflict.ours).toEqual(['ours'])
    expect(conflict.theirs).toEqual(['theirs'])
  })

  it('has no base when the file was written without one', () => {
    expect(parseConflicts(FILE).segments[1].base).toBeNull()
  })

  it('counts what there is to resolve', () => {
    expect(conflictCount(parseConflicts(FILE))).toBe(1)
    const two = parseConflicts([FILE, FILE].join('\n'))
    expect(conflictCount(two)).toBe(2)
  })

  it('reports a file with no conflicts at all', () => {
    const parsed = parseConflicts('just\ntext\n')
    expect(conflictCount(parsed)).toBe(0)
    expect(parsed.segments).toHaveLength(1)
  })

  // A file whose markers do not close is not a conflict file; treating the rest
  // as "ours" would silently drop the other side.
  it('refuses a truncated conflict rather than guessing', () => {
    expect(parseConflicts('<<<<<<< HEAD\nours\n')).toBeNull()
    expect(parseConflicts('<<<<<<< HEAD\nours\n=======\ntheirs\n')).toBeNull()
  })

  it('keeps a line that merely looks like a marker inside a resolved region', () => {
    const parsed = parseConflicts('a\n<<<<<<<not-a-marker\nb\n')
    expect(conflictCount(parsed)).toBe(0)
  })
})

describe('composeMerge', () => {
  const parsed = parseConflicts(FILE)

  it('takes our side', () => {
    expect(composeMerge(parsed, ['ours'])).toBe('top\nours one\nours two\nbottom')
  })

  it('takes their side', () => {
    expect(composeMerge(parsed, ['theirs'])).toBe('top\ntheirs one\nbottom')
  })

  it('takes both, ours first — the order the file had them in', () => {
    expect(composeMerge(parsed, ['both'])).toBe('top\nours one\nours two\ntheirs one\nbottom')
  })

  it('takes neither, leaving the surrounding text joined', () => {
    expect(composeMerge(parsed, ['neither'])).toBe('top\nbottom')
  })

  // Writing a half-resolved file would hand git a merge with markers still in
  // it, which is worse than not writing at all.
  it('refuses while any conflict is unresolved', () => {
    expect(composeMerge(parsed, [null])).toBeNull()
    expect(composeMerge(parsed, [])).toBeNull()
  })

  it('resolves each conflict independently', () => {
    const two = parseConflicts([FILE, FILE].join('\n'))
    expect(unresolvedCount(two, ['ours'])).toBe(1)
    const text = composeMerge(two, ['ours', 'theirs'])
    expect(text).toContain('ours one')
    expect(text).toContain('theirs one')
  })

  it('keeps the file’s trailing newline', () => {
    const withEol = parseConflicts(`${FILE}\n`)
    expect(composeMerge(withEol, ['ours']).endsWith('\n')).toBe(true)
  })

  it('keeps CRLF where the file used it', () => {
    const crlf = parseConflicts(FILE.split('\n').join('\r\n'))
    expect(composeMerge(crlf, ['ours'])).toBe('top\r\nours one\r\nours two\r\nbottom')
  })
})

// git genuinely produces files whose markers do not use the file's dominant
// line ending — a CRLF file gets LF markers. Picking one EOL for the whole file
// found ZERO conflicts in one, so the dialog said "nothing left to decide" and
// writing it back put the markers straight back on disk.
describe('parseConflicts — a file whose line endings are mixed', () => {
  const MIXED = 'header\r\none\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\ntail\n'

  it('finds the conflict whatever the surrounding line endings are', () => {
    const parsed = parseConflicts(MIXED)
    expect(conflictCount(parsed)).toBe(1)
    expect(parsed.segments[1].ours).toEqual(['ours'])
    expect(parsed.segments[1].theirs).toEqual(['theirs'])
  })

  it('gives every line back exactly the ending it had', () => {
    const parsed = parseConflicts(MIXED)
    expect(composeMerge(parsed, ['ours'])).toBe('header\r\none\nours\ntail\n')
  })

  it('round-trips a file it changes nothing in', () => {
    const plain = 'a\r\nb\nc'
    expect(composeMerge(parseConflicts(plain), [])).toBe(plain)
  })
})

// A decoration and an edit both need to know WHERE a region is, in the lines
// Monaco counts from 1.
describe('parseConflicts — where each region sits', () => {
  it('gives each conflict its line range, markers included', () => {
    const [, conflict] = parseConflicts(FILE).segments
    // 1 top · 2 <<<<<<< · 3-4 ours · 5 ======= · 6 theirs · 7 >>>>>>> · 8 bottom
    expect(conflict.startLine).toBe(2)
    expect(conflict.endLine).toBe(7)
  })

  it('counts a second conflict from where the first ended', () => {
    const two = parseConflicts([FILE, FILE].join('\n'))
    const conflicts = two.segments.filter((s) => s.type === 'conflict')
    expect(conflicts[0].startLine).toBe(2)
    expect(conflicts[1].startLine).toBe(10)
    expect(conflicts[1].endLine).toBe(15)
  })

  it('starts at line 1 when the file opens on a conflict', () => {
    expect(parseConflicts(DIFF3).segments[0].startLine).toBe(1)
  })
})
