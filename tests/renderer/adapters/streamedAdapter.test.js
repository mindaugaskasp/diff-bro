import { describe, it, expect } from 'vitest'
import { resolveAdapter } from '../../../src/renderer/src/adapters'
import { streamedAdapter } from '../../../src/renderer/src/adapters/streamedAdapter'

const BIG = { path: '/big/app.log', name: 'app.log', size: 60 * 1024 * 1024, kind: 'streamed' }

describe('streamedAdapter', () => {
  it('matches only a streamed descriptor', () => {
    expect(streamedAdapter.matches(BIG)).toBe(true)
    expect(streamedAdapter.matches({ name: 'a.txt', content: 'x' })).toBe(false)
    expect(streamedAdapter.matches({ name: 'b.xlsx', kind: 'spreadsheet' })).toBe(false)
    expect(streamedAdapter.matches(null)).toBe(false)
  })

  it('carries the path rather than text — there is none to carry', () => {
    expect(streamedAdapter.toComparable(BIG)).toEqual({
      kind: 'streamed',
      path: '/big/app.log',
      name: 'app.log',
      size: 60 * 1024 * 1024
    })
    expect(streamedAdapter.toComparable(BIG).text).toBeUndefined()
  })

  it('defaults a missing size rather than emitting undefined', () => {
    expect(streamedAdapter.toComparable({ path: '/p', name: 'p', kind: 'streamed' }).size).toBe(0)
  })

  it('is picked by the registry ahead of the catch-all text adapter', () => {
    expect(resolveAdapter(BIG)).toBe(streamedAdapter)
  })

  it('does not steal an ordinary text file from the text adapter', () => {
    expect(resolveAdapter({ name: 'a.txt', content: 'x' }).id).toBe('text')
  })

  it('does not steal a spreadsheet', () => {
    expect(resolveAdapter({ name: 'b.xlsx', kind: 'spreadsheet', sheets: [] }).id).toBe('xlsx')
  })
})
