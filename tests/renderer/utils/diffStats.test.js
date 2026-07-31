import { describe, expect, it } from 'vitest'
import { diffLineStats } from '../../../src/renderer/src/utils/diffStats'

const change = (o) => ({
  originalStartLineNumber: 0,
  originalEndLineNumber: 0,
  modifiedStartLineNumber: 0,
  modifiedEndLineNumber: 0,
  ...o
})

describe('diffLineStats', () => {
  it('counts a replaced block on both sides', () => {
    const changes = [
      change({
        originalStartLineNumber: 4,
        originalEndLineNumber: 6,
        modifiedStartLineNumber: 4,
        modifiedEndLineNumber: 5
      })
    ]
    expect(diffLineStats(changes)).toEqual({ additions: 2, deletions: 3 })
  })

  // Monaco zeroes the other side's end line for a pure insert or delete; adding
  // start..end anyway would credit a phantom line to it.
  it('counts an insertion as additions only', () => {
    const changes = [
      change({
        originalStartLineNumber: 7,
        modifiedStartLineNumber: 8,
        modifiedEndLineNumber: 10
      })
    ]
    expect(diffLineStats(changes)).toEqual({ additions: 3, deletions: 0 })
  })

  it('counts a deletion as deletions only', () => {
    const changes = [
      change({
        originalStartLineNumber: 2,
        originalEndLineNumber: 2,
        modifiedStartLineNumber: 1
      })
    ]
    expect(diffLineStats(changes)).toEqual({ additions: 0, deletions: 1 })
  })

  it('sums every change in the diff', () => {
    const changes = [
      change({ modifiedStartLineNumber: 1, modifiedEndLineNumber: 2 }),
      change({ originalStartLineNumber: 9, originalEndLineNumber: 9 })
    ]
    expect(diffLineStats(changes)).toEqual({ additions: 2, deletions: 1 })
  })

  // The distinction that stops the "both sides are identical" banner flashing
  // over every freshly opened diff: Monaco computes its diff in a worker and
  // returns null until that lands. An empty ARRAY means "computed, no changes";
  // null means "not computed yet", which is not the same claim at all.
  it('reports zeroes for genuinely identical files', () => {
    expect(diffLineStats([])).toEqual({ additions: 0, deletions: 0 })
  })

  it('reports nothing at all while the diff is still being computed', () => {
    expect(diffLineStats(null)).toBeNull()
    expect(diffLineStats(undefined)).toBeNull()
  })
})
