import { describe, expect, it } from 'vitest'
import { contentStats } from '../../../src/renderer/src/utils/contentStats'

describe('contentStats', () => {
  it('counts lines and characters', () => {
    expect(contentStats('ab\ncd')).toEqual({ lines: 2, characters: 5 })
  })
  it('an empty snippet is one empty line', () => {
    expect(contentStats('')).toEqual({ lines: 1, characters: 0 })
  })
  it('counts a CRLF line break once', () => {
    expect(contentStats('a\r\nb').lines).toBe(2)
  })
  it('counts characters, not UTF-16 units', () => {
    expect(contentStats('🙂').characters).toBe(1)
  })
})
