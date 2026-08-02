import { describe, expect, it } from 'vitest'
import { byteSize } from '../../../src/renderer/src/utils/byteSize'

// One helper so a size reads the same wherever it appears.
describe('byteSize', () => {
  it('scales to the unit a reader can hold in their head', () => {
    expect(byteSize(0)).toBe('0 B')
    expect(byteSize(512)).toBe('512 B')
    expect(byteSize(1024)).toBe('1.0 KB')
    expect(byteSize(1536)).toBe('1.5 KB')
    expect(byteSize(1024 * 1024)).toBe('1.0 MB')
    expect(byteSize(9.3 * 1024 * 1024)).toBe('9.3 MB')
    expect(byteSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB')
  })

  it('never shows a fraction of a byte, and survives nonsense', () => {
    expect(byteSize(999)).toBe('999 B')
    expect(byteSize(null)).toBe('0 B')
    expect(byteSize(undefined)).toBe('0 B')
    expect(byteSize(-5)).toBe('0 B')
    expect(byteSize('big')).toBe('0 B')
  })
})
