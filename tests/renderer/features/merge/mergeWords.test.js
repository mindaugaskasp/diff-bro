import { describe, expect, it } from 'vitest'
import { lineSpans, wordSpans } from '../../../../src/renderer/src/features/merge/mergeWords'

describe('lineSpans', () => {
  it('narrows to the part that changed', () => {
    expect(lineSpans('replicas: 5', 'replicas: 9')).toEqual({ ours: [11, 12], theirs: [11, 12] })
  })

  it('says nothing about two lines that agree', () => {
    expect(lineSpans('keep: yes', 'keep: yes')).toBeNull()
  })

  it('handles one side being longer at the tail', () => {
    const { ours, theirs } = lineSpans('mode: fast', 'mode: fastest')
    expect('mode: fast'.slice(ours[0] - 1, ours[1] - 1)).toBe('')
    expect('mode: fastest'.slice(theirs[0] - 1, theirs[1] - 1)).toBe('est')
  })

  // A shared head AND tail, with the change in the middle: peeling only one end
  // would paint the rest of the line as changed.
  it('peels both ends', () => {
    const { ours } = lineSpans('a = compute(1) + b', 'a = compute(2) + b')
    expect('a = compute(1) + b'.slice(ours[0] - 1, ours[1] - 1)).toBe('1')
  })

  it('marks the whole of two lines that share nothing', () => {
    expect(lineSpans('abc', 'xyz')).toEqual({ ours: [1, 4], theirs: [1, 4] })
  })
})

describe('wordSpans', () => {
  it('pairs the lines of a region and skips the ones that match', () => {
    const region = {
      ours: ['replicas: 5', 'keep: yes', 'region: us-east-1'],
      theirs: ['replicas: 9', 'keep: yes', 'region: eu-west-1']
    }
    const { ours, theirs } = wordSpans(region)
    expect(ours.map((s) => s.row)).toEqual([0, 2])
    expect(theirs.map((s) => s.row)).toEqual([0, 2])
  })

  // Pairing by index says nothing once a side has added or removed a line, and
  // a confident-looking wrong highlight is worse than none.
  it('stays out of it when the two sides are different lengths', () => {
    expect(wordSpans({ ours: ['a'], theirs: ['a', 'b'] })).toEqual({ ours: [], theirs: [] })
    expect(wordSpans({ ours: [], theirs: [] })).toEqual({ ours: [], theirs: [] })
    expect(wordSpans(null)).toEqual({ ours: [], theirs: [] })
  })
})
