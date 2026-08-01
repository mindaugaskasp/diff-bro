import { describe, it, expect } from 'vitest'
import { createLineScanner, digestBytes } from '../../src/main/lineIndexCore'

// Scan `text`, optionally forcing tiny chunks so every line, CRLF and lone CR
// is split across a read boundary — the classic streamed-index bug.
function scan(text, { chunk = Infinity, maxLines } = {}) {
  const bytes = Buffer.from(text, 'utf8')
  const lines = []
  const scanner = createLineScanner({
    onLine: (offset, length, hi, lo) => lines.push({ offset, length, hi, lo }),
    maxLines
  })
  for (
    let i = 0;
    i < bytes.length && !scanner.full();
    i += chunk === Infinity ? bytes.length : chunk
  ) {
    scanner.push(
      bytes.subarray(i, Math.min(bytes.length, i + (chunk === Infinity ? bytes.length : chunk)))
    )
  }
  scanner.end()
  return { lines, scanner, bytes }
}

// The text each record points at, resolved back out of the original buffer.
const textsOf = ({ lines, bytes }) =>
  lines.map((l) => bytes.toString('utf8', l.offset, l.offset + l.length))

describe('digestBytes', () => {
  it('is stable and distinguishes content', () => {
    const a = digestBytes(Buffer.from('hello'))
    expect(digestBytes(Buffer.from('hello'))).toEqual(a)
    expect(digestBytes(Buffer.from('hellp'))).not.toEqual(a)
  })

  it('fills both 32-bit lanes rather than leaving one constant', () => {
    const seen = new Set()
    for (let i = 0; i < 200; i++) seen.add(digestBytes(Buffer.from(`line ${i}`)).hi)
    expect(seen.size).toBeGreaterThan(150)
  })

  it('separates permutations, which a sum-style hash would collide', () => {
    expect(digestBytes(Buffer.from('ab'))).not.toEqual(digestBytes(Buffer.from('ba')))
  })
})

describe('createLineScanner', () => {
  it('reports nothing for an empty stream', () => {
    expect(scan('').lines).toEqual([])
  })

  it('treats a terminator as ending its line, so "a\\n" is one line', () => {
    expect(textsOf(scan('a\n'))).toEqual(['a'])
    expect(textsOf(scan('a\nb'))).toEqual(['a', 'b'])
  })

  it('keeps a final line that has no trailing newline', () => {
    const r = scan('one\ntwo\nthree')
    expect(textsOf(r)).toEqual(['one', 'two', 'three'])
    expect(r.lines[2]).toMatchObject({ offset: 8, length: 5 })
  })

  it('counts a bare newline as one empty line', () => {
    expect(textsOf(scan('\n'))).toEqual([''])
    expect(textsOf(scan('a\n\nb'))).toEqual(['a', '', 'b'])
  })

  it('strips CRLF terminators from the content', () => {
    const r = scan('one\r\ntwo\r\n')
    expect(textsOf(r)).toEqual(['one', 'two'])
    expect(r.lines.map((l) => l.length)).toEqual([3, 3])
    expect(r.lines.map((l) => l.offset)).toEqual([0, 5])
  })

  it('keeps a lone CR as content, not a terminator', () => {
    const r = scan('a\rb\n')
    expect(textsOf(r)).toEqual(['a\rb'])
  })

  it('keeps all but the last CR of a CR run before an LF', () => {
    expect(textsOf(scan('a\r\r\n'))).toEqual(['a\r'])
  })

  it('gives LF and CRLF files the same per-line digests', () => {
    const lf = scan('alpha\nbeta\ngamma\n').lines.map((l) => [l.hi, l.lo])
    const crlf = scan('alpha\r\nbeta\r\ngamma\r\n').lines.map((l) => [l.hi, l.lo])
    expect(crlf).toEqual(lf)
  })

  // The whole point of the streamed index: chunk boundaries must be invisible.
  it.each([1, 2, 3, 5, 7, 64])('is identical at a chunk size of %i bytes', (chunk) => {
    const text = 'alpha\nbeta\r\n\r\ngamma\rstill gamma\ndelta'
    const whole = scan(text)
    const split = scan(text, { chunk })
    expect(textsOf(split)).toEqual(textsOf(whole))
    expect(split.lines).toEqual(whole.lines)
  })

  it('splits a CRLF across a chunk boundary without emitting a stray CR', () => {
    // Chunk 1 ends on the CR, chunk 2 opens with the LF.
    const r = scan('one\r\ntwo', { chunk: 4 })
    expect(textsOf(r)).toEqual(['one', 'two'])
  })

  it('carries a single line longer than a chunk', () => {
    const long = 'x'.repeat(5000)
    const r = scan(`${long}\nshort`, { chunk: 97 })
    expect(textsOf(r)).toEqual([long, 'short'])
    expect(r.lines[0].length).toBe(5000)
    expect(r.lines[0].hi).toBe(digestBytes(Buffer.from(long)).hi)
  })

  it('digests a chunk-straddled line the same as an unsplit one', () => {
    const text = 'hello world this is one line\nand another\n'
    expect(scan(text, { chunk: 3 }).lines).toEqual(scan(text).lines)
  })

  it('stops at maxLines and reports being full', () => {
    const r = scan('a\nb\nc\nd\ne\n', { maxLines: 3 })
    expect(textsOf(r)).toEqual(['a', 'b', 'c'])
    expect(r.scanner.full()).toBe(true)
    expect(r.scanner.count()).toBe(3)
  })

  it('is not full when the stream fits', () => {
    const r = scan('a\nb\n', { maxLines: 10 })
    expect(r.scanner.full()).toBe(false)
    expect(r.scanner.count()).toBe(2)
  })

  it('records offsets that address the original bytes', () => {
    const r = scan('héllo\nwörld\n') // multi-byte UTF-8: offsets are BYTES
    expect(r.lines[1].offset).toBe(Buffer.byteLength('héllo\n'))
    expect(textsOf(r)).toEqual(['héllo', 'wörld'])
  })
})
