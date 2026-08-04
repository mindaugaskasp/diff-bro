import { describe, expect, it } from 'vitest'
import { hasStatusBand } from '../../../src/renderer/src/utils/statusBand'

// The floating shortcut bar clears the band only when there IS one, so a wrong
// answer here either covers the change counts or leaves the bar hovering.
const store = (over) => ({ ready: true, comparableKind: 'text', stats: null, identical: false, ...over })

describe('hasStatusBand', () => {
  it('is false before a comparison is ready', () => {
    expect(hasStatusBand(store({ ready: false }))).toBe(false)
    expect(hasStatusBand(undefined)).toBe(false)
  })

  // Monaco diffs in a worker and hands back null until it returns; the band is
  // not drawn yet, so the bar must not move for it.
  it('waits for the text diff to have a result', () => {
    expect(hasStatusBand(store({ stats: null }))).toBe(false)
    expect(hasStatusBand(store({ stats: { additions: 1, deletions: 0 } }))).toBe(true)
  })

  it('is false for identical text — the band is not drawn', () => {
    expect(hasStatusBand(store({ stats: { additions: 0, deletions: 0 }, identical: true }))).toBe(
      false
    )
  })

  // Every other viewer renders its band as soon as it is on screen.
  it('is true for every non-text comparison, with or without stats', () => {
    for (const kind of ['diagram', 'tree', 'streamed', 'spreadsheet']) {
      expect(hasStatusBand(store({ comparableKind: kind })), kind).toBe(true)
      expect(hasStatusBand(store({ comparableKind: kind, identical: true })), kind).toBe(true)
    }
  })
})
