import { describe, expect, it } from 'vitest'
import {
  MAX_SNIPPET_HISTORY,
  recordVersion,
  validHistory,
  versionRows
} from '../../../src/renderer/src/utils/snippetHistory'

const box = (n) => ({ savedAt: n, iv: `iv${n}`, data: `data${n}` })
const entryWith = (history) => ({ updatedAt: 99, iv: 'ivNew', data: 'dataNew', history })

describe('recordVersion', () => {
  it("pushes the entry's current box stamped with when it was written", () => {
    const entry = entryWith([])
    recordVersion(entry)
    expect(entry.history).toEqual([{ savedAt: 99, iv: 'ivNew', data: 'dataNew' }])
  })

  it('creates the history array on first record', () => {
    const entry = entryWith(undefined)
    delete entry.history
    recordVersion(entry)
    expect(entry.history).toHaveLength(1)
  })

  it('caps at MAX_SNIPPET_HISTORY, dropping the oldest', () => {
    const entry = entryWith(Array.from({ length: MAX_SNIPPET_HISTORY }, (_, i) => box(i)))
    recordVersion(entry)
    expect(entry.history).toHaveLength(MAX_SNIPPET_HISTORY)
    expect(entry.history[0].savedAt).toBe(1)
    expect(entry.history.at(-1).savedAt).toBe(99)
  })
})

describe('validHistory', () => {
  it('passes a well-formed list through', () => {
    expect(validHistory([box(1), box(2)])).toEqual([box(1), box(2)])
  })

  it('rejects non-arrays outright', () => {
    for (const bad of [undefined, null, 'x', 7, { 0: box(1) }]) {
      expect(validHistory(bad)).toEqual([])
    }
  })

  it('drops malformed versions and keeps the rest', () => {
    const bad = [box(1), { savedAt: 'no', iv: 'a', data: 'b' }, { iv: 'a' }, null, box(2)]
    expect(validHistory(bad)).toEqual([box(1), box(2)])
  })

  it('keeps only the newest MAX entries of an oversized list', () => {
    const long = Array.from({ length: MAX_SNIPPET_HISTORY + 5 }, (_, i) => box(i))
    const kept = validHistory(long)
    expect(kept).toHaveLength(MAX_SNIPPET_HISTORY)
    expect(kept[0].savedAt).toBe(5)
  })
})

describe('versionRows', () => {
  it('lists current first, then history newest-first, each carrying its index', () => {
    const rows = versionRows(entryWith([box(1), box(2), box(3)]))
    expect(rows).toEqual([
      { index: -1, at: 99 },
      { index: 2, at: 3 },
      { index: 1, at: 2 },
      { index: 0, at: 1 }
    ])
  })

  it('is just the current row for an entry with no history', () => {
    expect(versionRows(entryWith(undefined))).toEqual([{ index: -1, at: 99 }])
    expect(versionRows(null)).toEqual([{ index: -1, at: 0 }])
  })
})
