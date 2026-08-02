import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_LINE_BYTES, indexFile, readLines } from '../../src/main/lineIndex'

let dir
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'diffbro-index-'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

// Fixtures are written under a temp dir, never tests/data — nothing to sweep up
// in the repo afterwards.
function fixture(name, contents) {
  const path = join(dir, name)
  writeFileSync(path, contents)
  return path
}

const allLines = (index) => readLines(index, 0, index.count)

describe('indexFile', () => {
  it('indexes an empty file as no lines', async () => {
    const index = await indexFile(fixture('empty.txt', ''))
    expect(index.count).toBe(0)
    expect(await allLines(index)).toEqual([])
  })

  it('indexes a plain LF file', async () => {
    const index = await indexFile(fixture('lf.txt', 'one\ntwo\nthree\n'))
    expect(index.count).toBe(3)
    expect(await allLines(index)).toEqual(['one', 'two', 'three'])
  })

  it('keeps a final line with no trailing newline', async () => {
    const index = await indexFile(fixture('notrail.txt', 'one\ntwo'))
    expect(index.count).toBe(2)
    expect(await allLines(index)).toEqual(['one', 'two'])
  })

  it('strips CRLF terminators', async () => {
    const index = await indexFile(fixture('crlf.txt', 'one\r\ntwo\r\n'))
    expect(await allLines(index)).toEqual(['one', 'two'])
  })

  it('gives LF and CRLF files matching digests', async () => {
    const lf = await indexFile(fixture('d-lf.txt', 'alpha\nbeta\n'))
    const crlf = await indexFile(fixture('d-crlf.txt', 'alpha\r\nbeta\r\n'))
    expect([...crlf.hi]).toEqual([...lf.hi])
    expect([...crlf.lo]).toEqual([...lf.lo])
  })

  // The bug this whole design invites: a line, or a CRLF, split across two reads.
  it.each([1, 2, 3, 7, 64, 4096])('is identical at a chunk size of %i', async (chunkSize) => {
    const text = 'alpha\nbeta\r\n\r\ngamma\rstill\ndelta'
    const path = fixture('chunky.txt', text)
    const whole = await indexFile(path)
    const split = await indexFile(path, { chunkSize })
    expect(await allLines(split)).toEqual(await allLines(whole))
    expect([...split.offsets]).toEqual([...whole.offsets])
    expect([...split.hi]).toEqual([...whole.hi])
  })

  it('indexes a single line spanning many chunks', async () => {
    const long = 'z'.repeat(40_000)
    const index = await indexFile(fixture('long.txt', `${long}\nafter\n`), { chunkSize: 1024 })
    expect(index.count).toBe(2)
    const [first, second] = await allLines(index)
    expect(first).toBe(long)
    expect(second).toBe('after')
  })

  it('clips a line past the display ceiling but still indexes the rest', async () => {
    const huge = 'q'.repeat(MAX_LINE_BYTES + 5000)
    const index = await indexFile(fixture('huge-line.txt', `${huge}\ntail\n`))
    expect(index.lengths[0]).toBe(MAX_LINE_BYTES)
    const [first, second] = await allLines(index)
    expect(first).toHaveLength(MAX_LINE_BYTES)
    expect(second).toBe('tail')
  })

  it('gives two lines that differ only past the ceiling different digests', async () => {
    // The digest covers the WHOLE line even though only the head is readable,
    // so a clipped line is never wrongly reported as identical.
    const head = 'p'.repeat(MAX_LINE_BYTES)
    const a = await indexFile(fixture('clip-a.txt', `${head}AAA\n`))
    const b = await indexFile(fixture('clip-b.txt', `${head}BBB\n`))
    expect(a.lengths[0]).toBe(b.lengths[0])
    expect([a.hi[0], a.lo[0]]).not.toEqual([b.hi[0], b.lo[0]])
  })

  it('stops at the line cap and reports being truncated', async () => {
    const text = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n')
    const index = await indexFile(fixture('capped.txt', text), { maxLines: 100 })
    expect(index.count).toBe(100)
    expect(index.truncated).toBe(true)
    expect((await allLines(index)).at(-1)).toBe('line 99')
  })

  it('is not truncated when the file fits', async () => {
    const index = await indexFile(fixture('fits.txt', 'a\nb\n'), { maxLines: 100 })
    expect(index.truncated).toBe(false)
  })

  it('records byte offsets, not character offsets', async () => {
    const index = await indexFile(fixture('utf8.txt', 'héllo\nwörld\n'))
    expect(index.offsets[1]).toBe(Buffer.byteLength('héllo\n'))
    expect(await allLines(index)).toEqual(['héllo', 'wörld'])
  })

  it('grows its storage past the initial capacity', async () => {
    const text = Array.from({ length: 5000 }, (_, i) => `l${i}`).join('\n')
    const index = await indexFile(fixture('grown.txt', text))
    expect(index.count).toBe(5000)
    expect(await readLines(index, 4998, 5000)).toEqual(['l4998', 'l4999'])
  })
})

describe('readLines', () => {
  let index
  beforeAll(async () => {
    const text = Array.from({ length: 100 }, (_, i) => `row ${i}`).join('\n')
    index = await indexFile(fixture('window.txt', `${text}\n`))
  })

  it('serves an interior window without reading the rest', async () => {
    expect(await readLines(index, 10, 13)).toEqual(['row 10', 'row 11', 'row 12'])
  })

  it('clamps a range that runs past the end', async () => {
    expect(await readLines(index, 98, 500)).toEqual(['row 98', 'row 99'])
  })

  it('clamps a negative start', async () => {
    expect(await readLines(index, -20, 2)).toEqual(['row 0', 'row 1'])
  })

  it('returns nothing for an inverted or empty range', async () => {
    expect(await readLines(index, 40, 40)).toEqual([])
    expect(await readLines(index, 40, 10)).toEqual([])
  })

  it('returns empty strings for blank lines', async () => {
    const blanks = await indexFile(fixture('blanks.txt', 'a\n\n\nb\n'))
    expect(await readLines(blanks, 0, 4)).toEqual(['a', '', '', 'b'])
  })
})
