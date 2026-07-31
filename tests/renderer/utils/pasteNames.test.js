import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIDE_NAME,
  MAX_SIDE_NAME,
  isDefaultSideName,
  sideName
} from '../../../src/renderer/src/utils/pasteNames'

describe('sideName', () => {
  it('uses the name the user gave', () => {
    expect(sideName('left', 'staging response')).toBe('staging response')
  })

  it('falls back to the placeholder when nothing was typed', () => {
    expect(sideName('left', '')).toBe('Left (pasted)')
    expect(sideName('right', undefined)).toBe('Right (pasted)')
    expect(sideName('left', '   ')).toBe('Left (pasted)')
  })

  it('tidies whitespace rather than storing it', () => {
    expect(sideName('left', '  prod   config  ')).toBe('prod config')
    expect(sideName('left', 'two\nlines')).toBe('two lines')
  })

  it('caps a name that would overrun a tab or a file slot', () => {
    const long = sideName('left', 'x'.repeat(200))
    expect(long).toHaveLength(MAX_SIDE_NAME)
  })

  it('never returns an empty label for an unknown side', () => {
    expect(sideName('sideways', '')).toBe(DEFAULT_SIDE_NAME.left)
  })
})

describe('isDefaultSideName', () => {
  it('recognises the placeholders the app supplies', () => {
    expect(isDefaultSideName('Left (pasted)')).toBe(true)
    expect(isDefaultSideName('Right (pasted)')).toBe(true)
  })

  it('treats anything the user chose as their own', () => {
    expect(isDefaultSideName('prod config')).toBe(false)
    expect(isDefaultSideName('')).toBe(false)
    expect(isDefaultSideName(undefined)).toBe(false)
  })
})
