import { describe, expect, it } from 'vitest'
import { rowFormatKey, rowTags } from '../../../src/renderer/src/utils/diffRowTags'

describe('rowFormatKey', () => {
  it('prefers the recorded format', () => {
    expect(rowFormatKey({ format: 'json', tags: ['work'] })).toBe('json')
  })

  it('falls back to a format-shaped tag for entries saved before the field existed', () => {
    expect(rowFormatKey({ tags: ['json', 'work'] })).toBe('json')
  })

  it('is null when nothing identifies the format', () => {
    expect(rowFormatKey({ tags: ['work'] })).toBeNull()
    expect(rowFormatKey(undefined)).toBeNull()
  })
})

describe('rowTags', () => {
  // The reported bug: tagging a .json diff "json" showed "Untagged".
  it('keeps a user tag that matches the diff format', () => {
    expect(rowTags({ format: 'json', tags: ['json'] })).toEqual(['json'])
  })

  it('reports no tags for a diff saved without any', () => {
    expect(rowTags({ format: 'json', tags: [] })).toEqual([])
  })

  it('drops the "imported" auto-tag, which the External section already states', () => {
    expect(rowTags({ format: 'json', tags: ['imported', 'work'] })).toEqual(['work'])
  })

  it("drops a legacy entry's format tag, which its monogram already states", () => {
    expect(rowTags({ tags: ['json', 'work'] })).toEqual(['work'])
  })

  it('tolerates a missing tags array', () => {
    expect(rowTags({ format: 'json' })).toEqual([])
    expect(rowTags(undefined)).toEqual([])
  })
})

// A pasted comparison has no filename, so its format is null — but the field is
// there. Treating that as "legacy" made the fallback read the user's own tag as
// the format and hide it, reviving the bug for paste-mode diffs.
describe('a diff saved with no detectable format', () => {
  it('keeps a language-shaped tag the user chose', () => {
    expect(rowTags({ format: null, tags: ['json'] })).toEqual(['json'])
  })

  it('does not invent a monogram from that tag', () => {
    expect(rowFormatKey({ format: null, tags: ['json'] })).toBeNull()
  })

  it('still reads a legacy entry, which has no format field at all', () => {
    expect(rowFormatKey({ tags: ['json'] })).toBe('json')
    expect(rowTags({ tags: ['json', 'work'] })).toEqual(['work'])
  })
})
