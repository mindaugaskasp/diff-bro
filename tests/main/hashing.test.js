// The checksum core. Digests are asserted against published vectors rather
// than against themselves — a test that hashes twice and compares proves only
// that the function is deterministic.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALGORITHMS, hashBuffer, hashFile } from '../../src/main/hashing'

// The canonical "The quick brown fox…" vectors.
const FOX = 'The quick brown fox jumps over the lazy dog'
const EXPECTED = {
  md5: '9e107d9d372bb6826bd81d3542a419d6',
  sha1: '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12',
  sha256: 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
  crc32: '414fa339'
}

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'diffbro-hash-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('hashBuffer', () => {
  it('matches the published vectors', () => {
    const out = hashBuffer(Buffer.from(FOX, 'utf8'))
    for (const [algo, digest] of Object.entries(EXPECTED)) expect(out[algo]).toBe(digest)
  })

  it('covers every algorithm the tool offers, plus CRC32', () => {
    expect(Object.keys(hashBuffer(Buffer.from('x')))).toEqual([...ALGORITHMS, 'crc32'])
  })

  // MD5 and SHA-1 are here on purpose: what people publish alongside a download
  // is often still one of them, and a checksum tool that can't check them is
  // answering a different question.
  it('offers the weak algorithms a checksum tool is actually asked for', () => {
    expect(ALGORITHMS).toContain('md5')
    expect(ALGORITHMS).toContain('sha1')
  })

  it('hashes an empty input rather than refusing it', () => {
    expect(hashBuffer(Buffer.alloc(0)).sha256).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })
})

describe('hashFile', () => {
  it('agrees with the in-memory digest of the same bytes', async () => {
    const path = join(dir, 'fox.txt')
    writeFileSync(path, FOX)
    expect(await hashFile(path)).toEqual(hashBuffer(Buffer.from(FOX, 'utf8')))
  })

  // Chunked reading is the whole point: the file must never have to fit in
  // memory. Several megabytes crosses the stream's chunk boundary many times,
  // which is where a naive accumulator (or a mis-seeded CRC) breaks.
  it('streams a multi-chunk file to the same digest as one buffer', async () => {
    const bytes = Buffer.alloc(5 * 1024 * 1024)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
    const path = join(dir, 'big.bin')
    writeFileSync(path, bytes)
    expect(await hashFile(path)).toEqual(hashBuffer(bytes))
  })

  it('rejects rather than resolving for a file that isn’t there', async () => {
    await expect(hashFile(join(dir, 'nope.bin'))).rejects.toThrow()
  })
})
