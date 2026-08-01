import { describe, expect, it } from 'vitest'
import { fileSize, matchingAlgorithm } from '../../../src/renderer/src/utils/hash'

const DIGESTS = {
  md5: '9e107d9d372bb6826bd81d3542a419d6',
  sha256: 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
  crc32: '414fa339'
}

describe('matchingAlgorithm', () => {
  it('names the algorithm a pasted digest belongs to', () => {
    expect(matchingAlgorithm(DIGESTS.sha256, DIGESTS).algorithm).toBe('sha256')
    expect(matchingAlgorithm(DIGESTS.crc32, DIGESTS).algorithm).toBe('crc32')
  })

  // A digest people paste has been through a webpage, an email, or a
  // `sha256sum` line. None of that is a mismatch.
  it('ignores case, surrounding space, and a trailing filename', () => {
    expect(matchingAlgorithm(`  ${DIGESTS.md5.toUpperCase()}  `, DIGESTS).algorithm).toBe('md5')
    expect(matchingAlgorithm(`${DIGESTS.md5}  archive.zip`, DIGESTS).algorithm).toBe('md5')
  })

  it('says "no match" only once something was actually pasted', () => {
    expect(matchingAlgorithm('', DIGESTS)).toEqual({ algorithm: null, checked: false })
    expect(matchingAlgorithm('   ', DIGESTS)).toEqual({ algorithm: null, checked: false })
    expect(matchingAlgorithm('deadbeef', DIGESTS)).toEqual({ algorithm: null, checked: true })
  })

  it('is safe with nothing computed yet', () => {
    expect(matchingAlgorithm('abc', undefined).algorithm).toBeNull()
  })
})

describe('fileSize', () => {
  it('reads in the unit that suits the size', () => {
    expect(fileSize(512)).toBe('512 B')
    expect(fileSize(2048)).toBe('2.0 KB')
    expect(fileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('says nothing rather than NaN', () => {
    expect(fileSize(undefined)).toBe('')
    expect(fileSize(-1)).toBe('')
  })
})
