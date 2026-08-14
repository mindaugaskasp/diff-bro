import { describe, expect, it } from 'vitest'
import {
  comparedSides,
  copyableSide,
  isCopyableSide
} from '../../../src/renderer/src/utils/sideText'

const files = (left, right) => ({ mode: 'files', left, right })
const pasted = (over = {}) => ({
  mode: 'paste',
  pasteLeft: '',
  pasteRight: '',
  pasteLeftFile: null,
  pasteRightFile: null,
  ...over
})

describe('comparedSides', () => {
  it('reads the loaded files in files mode', () => {
    const store = files({ name: 'a.json', content: 'A' }, { name: 'b.json', content: 'B' })
    expect(comparedSides(store).map((s) => s.name)).toEqual(['a.json', 'b.json'])
  })

  it('names an empty slot rather than returning nothing', () => {
    expect(comparedSides(files(null, null))).toEqual([
      { name: 'Left', content: '' },
      { name: 'Right', content: '' }
    ])
  })

  it('reads the pasted buffers in paste mode', () => {
    const store = pasted({ pasteLeft: 'typed left', pasteRight: 'typed right' })
    expect(comparedSides(store).map((s) => s.content)).toEqual(['typed left', 'typed right'])
  })

  // A file dropped onto a paste side replaces the buffer for that side only.
  it('prefers a file dropped on a paste side over its buffer', () => {
    const store = pasted({
      pasteLeft: 'ignored',
      pasteLeftFile: { name: 'dropped.txt', content: 'from the file' }
    })
    expect(comparedSides(store)[0]).toEqual({ name: 'dropped.txt', content: 'from the file' })
  })
})

// This is what keeps the copy control off a side that cannot produce text. A
// spreadsheet carries `sheets` and a streamed file carries only a path, so
// neither has `content` at all — asking for the button's answer here means the
// button and the action can never disagree.
describe('isCopyableSide', () => {
  it('says yes to a text side with content', () => {
    expect(isCopyableSide({ name: 'a.txt', content: 'hello' })).toBe(true)
  })

  it('says no to a spreadsheet, which carries sheets and no content', () => {
    expect(isCopyableSide({ name: 'book.xlsx', kind: 'spreadsheet', sheets: [] })).toBe(false)
  })

  it('says no to a streamed file, which carries only a path', () => {
    expect(isCopyableSide({ name: 'huge.log', kind: 'streamed', path: '/tmp/huge.log' })).toBe(
      false
    )
  })

  it('says no to an empty side, and to no side at all', () => {
    expect(isCopyableSide({ name: 'empty.txt', content: '' })).toBe(false)
    expect(isCopyableSide(null)).toBe(false)
    expect(isCopyableSide(undefined)).toBe(false)
  })
})

describe('copyableSide', () => {
  it('gives the name and content of the side asked for', () => {
    const store = files({ name: 'a.json', content: 'A' }, { name: 'b.json', content: 'B' })
    expect(copyableSide(store, 'left')).toEqual({ name: 'a.json', content: 'A' })
    expect(copyableSide(store, 'right')).toEqual({ name: 'b.json', content: 'B' })
  })

  it('works the same in paste mode', () => {
    const store = pasted({ pasteLeft: 'L', pasteRight: 'R' })
    expect(copyableSide(store, 'left')).toEqual({ name: 'Left', content: 'L' })
    expect(copyableSide(store, 'right')).toEqual({ name: 'Right', content: 'R' })
  })

  it('gives null for a side with nothing to copy', () => {
    const store = files({ name: 'book.xlsx', kind: 'spreadsheet' }, null)
    expect(copyableSide(store, 'left')).toBe(null)
    expect(copyableSide(store, 'right')).toBe(null)
  })

  // One side being uncopyable must not take the other with it — a spreadsheet
  // compared against a CSV still has one side worth copying.
  it('answers each side on its own', () => {
    const store = files({ name: 'book.xlsx', kind: 'spreadsheet' }, { name: 'b.csv', content: 'B' })
    expect(copyableSide(store, 'left')).toBe(null)
    expect(copyableSide(store, 'right')).toEqual({ name: 'b.csv', content: 'B' })
  })
})
