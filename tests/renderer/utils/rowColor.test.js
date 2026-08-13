import { describe, expect, it } from 'vitest'
import { ROW_COLORS, rowColorHex, rowColorId } from '../../../src/renderer/src/utils/rowColor'

// The stored value is a NAME, and only a name from this list is a colour. It
// arrives from a persisted library that a reader can hand-edit, so everything
// else — including a key inherited from Object — resolves to no colour at all.
describe('rowColorId', () => {
  it('accepts every id in the palette', () => {
    for (const c of ROW_COLORS) expect(rowColorId(c.id)).toBe(c.id)
  })

  it('refuses anything that is not one of them', () => {
    for (const bad of [null, undefined, '', 'puce', '#e9687e', 42, {}, ['blue']]) {
      expect(rowColorId(bad)).toBe(null)
    }
  })

  it('refuses an inherited key', () => {
    expect(rowColorId('constructor')).toBe(null)
    expect(rowColorId('toString')).toBe(null)
    expect(rowColorId('__proto__')).toBe(null)
  })
})

describe('rowColorHex', () => {
  it('gives the palette hex for a stored id, and null for anything else', () => {
    expect(rowColorHex('blue')).toBe('#299ff4')
    expect(rowColorHex('nope')).toBe(null)
    expect(rowColorHex(null)).toBe(null)
  })
})

// Six, spread around the hue circle — the whole reason a picker of twenty was
// rejected. A future edit that adds a near-neighbour should have to argue with
// this test rather than slip past it.
describe('the palette itself', () => {
  it('is six colours, each with an id, a hex and a label key', () => {
    expect(ROW_COLORS).toHaveLength(6)
    for (const c of ROW_COLORS) {
      expect(c.id).toMatch(/^[a-z]+$/)
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(c.labelKey).toBe(`rowColor.${c.id}`)
    }
  })

  it('has no two ids or hexes the same', () => {
    expect(new Set(ROW_COLORS.map((c) => c.id)).size).toBe(6)
    expect(new Set(ROW_COLORS.map((c) => c.hex)).size).toBe(6)
  })
})
