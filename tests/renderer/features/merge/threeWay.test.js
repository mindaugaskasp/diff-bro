import { describe, expect, it } from 'vitest'
import {
  initialRanges,
  linesFor,
  sidesFromConflicts
} from '../../../../src/renderer/src/features/merge/threeWay'
import { parseConflicts } from '../../../../src/renderer/src/utils/mergeConflicts'

const FILE = [
  'top',
  '<<<<<<< HEAD',
  'ours one',
  '=======',
  'theirs one',
  '>>>>>>> feature',
  'bottom'
].join('\n')

describe('sidesFromConflicts', () => {
  // The panes show whole files, not fragments: a reader compares the two
  // versions, and a three-line excerpt is what the old dialog got wrong.
  it('reads each side as a whole file, stable text included', () => {
    const { ours, theirs } = sidesFromConflicts(parseConflicts(FILE))
    expect(ours).toBe('top\nours one\nbottom')
    expect(theirs).toBe('top\ntheirs one\nbottom')
  })

  it('handles a file with no conflicts at all', () => {
    const { ours, theirs } = sidesFromConflicts(parseConflicts('just\ntext'))
    expect(ours).toBe('just\ntext')
    expect(theirs).toBe('just\ntext')
  })

  it('says nothing rather than throwing on an unreadable file', () => {
    expect(sidesFromConflicts(null)).toEqual({ ours: '', theirs: '' })
  })
})

// The result opens with our side standing in each conflicted place, so the
// decorations that mark those places need to know where they landed.
describe('initialRanges', () => {
  it('places each conflict where our side put it', () => {
    // top(1) · ours one(2) · bottom(3)
    expect(initialRanges(parseConflicts(FILE))).toEqual([{ line: 2, count: 1 }])
  })

  it('counts a second conflict after the first side’s lines', () => {
    const two = parseConflicts([FILE, FILE].join('\n'))
    expect(initialRanges(two)).toEqual([
      { line: 2, count: 1 },
      { line: 5, count: 1 }
    ])
  })

  // Our side deleting the lines still needs a place to mark.
  it('gives a zero-length range where our side has nothing', () => {
    const gone = ['<<<<<<< HEAD', '=======', 'theirs', '>>>>>>> f'].join('\n')
    expect(initialRanges(parseConflicts(gone))).toEqual([{ line: 1, count: 0 }])
  })
})

describe('linesFor', () => {
  const region = { ours: ['a'], theirs: ['b'] }

  it('gives each answer its lines, both in the file’s own order', () => {
    expect(linesFor(region, 'ours')).toEqual(['a'])
    expect(linesFor(region, 'theirs')).toEqual(['b'])
    expect(linesFor(region, 'both')).toEqual(['a', 'b'])
    expect(linesFor(region, 'neither')).toEqual([])
  })

  it('refuses an answer that is not one of the four', () => {
    expect(linesFor(region, 'whatever')).toBeNull()
  })
})
