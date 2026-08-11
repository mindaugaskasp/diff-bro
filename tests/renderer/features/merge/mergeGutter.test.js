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

// The side texts arrive from git exactly as the file is stored, but a region's
// lines came through a parser that stripped the ending. Splitting the haystack
// on \n alone leaves a \r on every line of a CRLF file, so nothing ever matched
// and a Windows repo got no chevrons and no word tints at all.
describe('a CRLF side text', () => {
  const crlf = 'one\r\nreplicas: 5\r\nthree\r\n'

  it('finds a region whose lines were parsed without the ending', () => {
    expect(findLines(crlf, ['replicas: 5'])).toBe(2)
  })

  it('anchors the region so the chevron has somewhere to hang', () => {
    const anchors = gutterAnchors(
      crlf,
      [{ ours: ['replicas: 5'], theirs: ['replicas: 9'] }],
      'ours'
    )
    expect(anchors[0]).toEqual({ line: 2, count: 1 })
  })
})
