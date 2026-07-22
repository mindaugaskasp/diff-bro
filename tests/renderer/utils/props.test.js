import { describe, expect, it } from 'vitest'
import { arrayOfShape, shaped } from '../../../src/renderer/src/utils/props'

describe('shaped', () => {
  const isEntry = shaped('id', 'name')

  it('accepts an object carrying every declared field', () => {
    expect(isEntry({ id: '1', name: 'x' })).toBe(true)
    expect(isEntry({ id: '1', name: 'x', extra: true })).toBe(true)
  })

  it('rejects a missing field, even when the value is undefined-ish', () => {
    expect(isEntry({ id: '1' })).toBe(false)
    // Present-but-empty is the caller's business; presence is what's checked.
    expect(isEntry({ id: '1', name: undefined })).toBe(true)
  })

  it('rejects non-objects', () => {
    expect(isEntry(null)).toBe(false)
    expect(isEntry(undefined)).toBe(false)
    expect(isEntry('nope')).toBe(false)
  })
})

describe('arrayOfShape', () => {
  const isChips = arrayOfShape('name', 'count')

  it('requires every item to satisfy the shape', () => {
    expect(isChips([])).toBe(true)
    expect(isChips([{ name: 'a', count: 1 }])).toBe(true)
    expect(isChips([{ name: 'a', count: 1 }, { name: 'b' }])).toBe(false)
  })

  it('rejects anything that is not an array', () => {
    expect(isChips({ name: 'a', count: 1 })).toBe(false)
    expect(isChips(null)).toBe(false)
  })
})
