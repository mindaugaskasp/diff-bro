// Filesystem side of the streamed line index: walk a file in chunks, keeping
// only the per-line record the pure scanner emits, then serve arbitrary line
// ranges back out of it on demand. The file itself is never held.
//
// Cost is ~16 bytes a line (offset, length, two digest lanes) against hundreds
// for the text, which is what makes a file too large for an editor model
// ordinary to scroll.
import { open } from 'fs/promises'
import { createLineScanner } from './lineIndexCore'

// 4M lines is ~64 MB of index — the most worth holding for one side. Past it the
// index stops and says so rather than growing without bound.
export const MAX_INDEXED_LINES = 4_000_000
// Longer lines exist (a minified bundle is one line), but nothing can display
// one. Beyond this the tail is unreadable; the DIGEST still covers the whole
// line, so equality stays honest even where the text is clipped.
export const MAX_LINE_BYTES = 64 * 1024
const CHUNK_BYTES = 1 << 20

function growTyped(source, Ctor, capacity) {
  const next = new Ctor(capacity)
  next.set(source)
  return next
}

function createIndexStore() {
  let capacity = 1024
  let offsets = new Float64Array(capacity)
  let lengths = new Uint32Array(capacity)
  let hi = new Uint32Array(capacity)
  let lo = new Uint32Array(capacity)
  let count = 0
  return {
    add(offset, length, lineHi, lineLo) {
      if (count === capacity) {
        capacity *= 2
        offsets = growTyped(offsets, Float64Array, capacity)
        lengths = growTyped(lengths, Uint32Array, capacity)
        hi = growTyped(hi, Uint32Array, capacity)
        lo = growTyped(lo, Uint32Array, capacity)
      }
      offsets[count] = offset
      lengths[count] = length
      hi[count] = lineHi
      lo[count] = lineLo
      count++
    },
    finish: () => ({
      count,
      offsets: offsets.subarray(0, count),
      lengths: lengths.subarray(0, count),
      hi: hi.subarray(0, count),
      lo: lo.subarray(0, count)
    })
  }
}

/**
 * @typedef {object} LineIndex
 * @property {string} path
 * @property {number} count            indexed lines
 * @property {Float64Array} offsets    byte offset of each line's first byte
 * @property {Uint32Array} lengths     content bytes per line (terminator excluded)
 * @property {Uint32Array} hi          digest lanes, one entry per line
 * @property {Uint32Array} lo
 * @property {number} bytesScanned
 * @property {boolean} truncated       the line cap was reached before EOF
 */

/**
 * Build the line index for a file, reading it a chunk at a time.
 * @param {string} filePath
 * @param {{ maxLines?: number, chunkSize?: number }} [opts]
 * @returns {Promise<LineIndex>}
 */
export async function indexFile(filePath, opts = {}) {
  const maxLines = opts.maxLines ?? MAX_INDEXED_LINES
  const chunkSize = opts.chunkSize ?? CHUNK_BYTES
  const handle = await open(filePath, 'r')
  try {
    const store = createIndexStore()
    const scanner = createLineScanner({
      onLine: (offset, length, hi, lo) =>
        store.add(offset, Math.min(length, MAX_LINE_BYTES), hi, lo),
      maxLines
    })
    const buffer = Buffer.allocUnsafe(chunkSize)
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, null)
      if (!bytesRead) break
      scanner.push(buffer.subarray(0, bytesRead))
      if (scanner.full()) break
    }
    scanner.end()
    return {
      path: filePath,
      ...store.finish(),
      bytesScanned: scanner.bytesSeen(),
      truncated: scanner.full()
    }
  } finally {
    await handle.close()
  }
}

/**
 * Decode lines [from, to) back out of the file using the index. One read per
 * line, each bounded by the index's own clipped length, so a window costs the
 * bytes it shows and nothing more.
 * @param {LineIndex} index
 * @param {number} from  inclusive, 0-based
 * @param {number} to    exclusive
 * @returns {Promise<string[]>}
 */
export async function readLines(index, from, to) {
  const start = Math.max(0, Math.min(from, index.count))
  const end = Math.max(start, Math.min(to, index.count))
  if (start === end) return []
  const handle = await open(index.path, 'r')
  try {
    const out = []
    for (let i = start; i < end; i++) {
      const length = index.lengths[i]
      if (!length) {
        out.push('')
        continue
      }
      const buffer = Buffer.allocUnsafe(length)
      const { bytesRead } = await handle.read(buffer, 0, length, index.offsets[i])
      out.push(buffer.toString('utf8', 0, bytesRead))
    }
    return out
  } finally {
    await handle.close()
  }
}
