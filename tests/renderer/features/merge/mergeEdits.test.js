import { describe, expect, it } from 'vitest'
import { touchedIndexes, wholeLines } from '../../../../src/renderer/src/features/merge/mergeEdits'

const model = (lines) => ({
  getLineCount: () => lines.length,
  getLineMaxColumn: (n) => lines[n - 1].length + 1
})

describe('wholeLines', () => {
  it('reaches the start of the following line, so no half line survives', () => {
    const range = wholeLines(model(['a', 'b', 'c', 'd']), {
      startLineNumber: 2,
      endLineNumber: 3
    })
    expect(range).toMatchObject({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 4,
      endColumn: 1
    })
  })

  // There is no line after the last one to reach into.
  it('stops at the end of the file', () => {
    const range = wholeLines(model(['a', 'bb']), { startLineNumber: 1, endLineNumber: 2 })
    expect(range).toMatchObject({ endLineNumber: 2, endColumn: 3 })
  })

  // A side that deleted the lines has nothing to cover: it is a place to insert.
  // Its range is indistinguishable from a one-line region's, so only the flag
  // can say — and reading it as a line overwrote the stable line sitting there.
  it('collapses an emptied region to an insertion point', () => {
    const at = { startLineNumber: 2, endLineNumber: 2 }
    expect(wholeLines(model(['a', 'b', 'c']), at, true)).toMatchObject({
      startLineNumber: 2,
      endLineNumber: 2,
      endColumn: 1
    })
    expect(wholeLines(model(['a', 'b', 'c']), at, false)).toMatchObject({ endLineNumber: 3 })
  })
})

// Typing inside a conflict IS an answer. Without this the reader who typed the
// resolution still had to press a button before Save would unlock.
describe('touchedIndexes', () => {
  const regions = [{ resolved: false }, { resolved: false }, { resolved: true }]

  it('names the regions whose text has moved off what they last settled at', () => {
    expect(touchedIndexes(regions, ['a', 'CHANGED', 'z'], ['a', 'b', 'c'])).toEqual([1])
  })

  it('leaves an already-settled region alone, however it now reads', () => {
    expect(touchedIndexes(regions, ['a', 'b', 'CHANGED'], ['a', 'b', 'c'])).toEqual([])
  })

  it('says nothing when an edit landed outside every region', () => {
    expect(touchedIndexes(regions, ['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([])
  })
})
