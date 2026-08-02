// Pure core of the streamed line index: turn a byte stream, fed in arbitrary
// chunks, into one record per line — where it starts, how long it is, and a
// digest of its content. No fs here, so the chunk-boundary cases (a line, a
// CRLF, or a lone CR straddling two reads) are unit-testable.
//
// A 32-bit digest collides within a few million lines, and a collision here
// reads as "these two lines are identical" — a wrong diff. So the digest is
// 64-bit FNV-1a carried in two 32-bit lanes.
const OFFSET_HI = 0xcbf29ce4
const OFFSET_LO = 0x84222325
const PRIME_HI = 0x00000100
const PRIME_LO = 0x000001b3

const LF = 0x0a
const CR = 0x0d

// Exact 64-bit multiply of (hi,lo) by (pHi,pLo), keeping the low 64 bits.
// Split into 16-bit limbs so every partial product stays inside a double's
// 53-bit mantissa.
function mulLanes(hi, lo, pHi, pLo) {
  const aLo = lo & 0xffff
  const aHi = lo >>> 16
  const bLo = pLo & 0xffff
  const bHi = pLo >>> 16
  const p0 = aLo * bLo
  const p1 = aHi * bLo + (p0 >>> 16)
  const p2 = aLo * bHi + (p1 & 0xffff)
  const outLo = (((p2 & 0xffff) << 16) | (p0 & 0xffff)) >>> 0
  const carry = aHi * bHi + (p1 >>> 16) + (p2 >>> 16)
  const outHi = (carry + Math.imul(hi, pLo) + Math.imul(lo, pHi)) >>> 0
  return { hi: outHi, lo: outLo }
}

/**
 * The 64-bit FNV-1a digest of a whole buffer, as two 32-bit lanes. Exported for
 * tests and for callers that already hold a complete line.
 * @param {Uint8Array} bytes
 * @returns {{ hi: number, lo: number }}
 */
export function digestBytes(bytes) {
  let hi = OFFSET_HI
  let lo = OFFSET_LO
  for (let i = 0; i < bytes.length; i++) {
    lo = (lo ^ bytes[i]) >>> 0
    ;({ hi, lo } = mulLanes(hi, lo, PRIME_HI, PRIME_LO))
  }
  return { hi, lo }
}

/**
 * @callback LineSink
 * @param {number} offset  byte offset of the line's first content byte
 * @param {number} length  content bytes, excluding the line terminator
 * @param {number} hi      digest, high lane
 * @param {number} lo      digest, low lane
 */

/**
 * A resumable line scanner. Feed it chunks in order, then call `end()`.
 *
 * Line semantics follow git, not an editor: a terminator ends the line it
 * follows, so "a\n" is ONE line and "a\nb" is two. Only LF terminates; a CR is
 * content unless it immediately precedes an LF, which keeps CRLF files from
 * showing a stray carriage return on every line.
 *
 * @param {{ onLine: LineSink, maxLines?: number }} opts
 */
export function createLineScanner({ onLine, maxLines = Infinity }) {
  let offset = 0
  let lineStart = 0
  let lineLength = 0
  let hi = OFFSET_HI
  let lo = OFFSET_LO
  // A CR is held back until the next byte decides whether it was a terminator.
  // It survives across push() calls, which is the CRLF-straddles-a-chunk case.
  let heldCR = false
  let touched = false
  let lines = 0
  let overflowed = false

  function absorb(byte) {
    lo = (lo ^ byte) >>> 0
    ;({ hi, lo } = mulLanes(hi, lo, PRIME_HI, PRIME_LO))
    lineLength++
  }

  function emit(nextStart) {
    if (lines >= maxLines) overflowed = true
    else {
      onLine(lineStart, lineLength, hi, lo)
      lines++
    }
    lineStart = nextStart
    lineLength = 0
    hi = OFFSET_HI
    lo = OFFSET_LO
    touched = false
  }

  return {
    push(chunk) {
      for (let i = 0; i < chunk.length && !overflowed; i++) {
        const byte = chunk[i]
        touched = true
        if (byte === CR) {
          if (heldCR) absorb(CR)
          heldCR = true
        } else if (byte === LF) {
          heldCR = false
          emit(offset + 1)
        } else {
          if (heldCR) {
            absorb(CR)
            heldCR = false
          }
          absorb(byte)
        }
        offset++
      }
    },
    end() {
      if (heldCR) {
        absorb(CR)
        heldCR = false
      }
      if (touched) emit(offset)
    },
    // True once maxLines was reached — the caller stops reading rather than
    // scanning the rest of a file it cannot index.
    full: () => overflowed,
    count: () => lines,
    bytesSeen: () => offset
  }
}
