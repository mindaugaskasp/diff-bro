import { describe, expect, it } from 'vitest'
import { findLines, gutterAnchors } from '../../../../src/renderer/src/features/merge/mergeGutter'

describe('findLines', () => {
  const hay = 'a\nb\nc\nb\nc\nd'

  it('finds a run of lines and reports it 1-based', () => {
    expect(findLines(hay, ['b', 'c'])).toBe(2)
  })

  // Two identical hunks in one file must not both point at the first.
  it('searches forward from where the last region ended', () => {
    expect(findLines(hay, ['b', 'c'], 3)).toBe(4)
  })

  it('says nothing when the lines are not there', () => {
    expect(findLines(hay, ['zzz'])).toBeNull()
    expect(findLines(hay, [])).toBeNull()
  })
})

describe('gutterAnchors', () => {
  const regions = [
    { ours: ['x'], theirs: ['y'] },
    { ours: ['x'], theirs: ['z'] }
  ]

  it('anchors each region where its own lines sit', () => {
    expect(gutterAnchors('top\nx\nmid\nx\nend', regions, 'ours')).toEqual([
      { line: 2, count: 1 },
      { line: 4, count: 1 }
    ])
  })

  // A side that deleted those lines has nothing to offer, so it gets no chevron
  // rather than one pointing at the wrong place.
  it('gives no anchor for a region the side does not contain', () => {
    expect(gutterAnchors('nothing here', regions, 'ours')).toEqual([null, null])
  })
})
