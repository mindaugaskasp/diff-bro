// Checksum core. node:crypto has MD5 and SHA-1, which SubtleCrypto deliberately
// does not, and a file is read as a STREAM so a gigabyte never has to exist in
// memory — least of all the renderer's. Pure of Electron, so it is unit-tested;
// the IPC lives in hashTools.js.

import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
import { createReadStream } from 'node:fs'

// Weak by modern standards, and that is exactly why they are here: a checksum
// tool exists to answer "does this match what they published", and what gets
// published is often still MD5 or SHA-1.
export const ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512']

const hex32 = (n) => (n >>> 0).toString(16).padStart(8, '0')

/**
 * Every digest of one buffer.
 * @param {Buffer|Uint8Array} bytes
 * @returns {Record<string, string>}
 */
export function hashBuffer(bytes) {
  const out = {}
  for (const algo of ALGORITHMS) out[algo] = createHash(algo).update(bytes).digest('hex')
  out.crc32 = hex32(crc32(bytes))
  return out
}

/**
 * The same digests, computed a chunk at a time. Nothing accumulates but the
 * hash state, so file size stops being a limit.
 * @param {string} path
 * @returns {Promise<Record<string, string>>}
 */
export function hashFile(path) {
  const hashes = ALGORITHMS.map((algo) => [algo, createHash(algo)])
  let crc = 0
  return new Promise((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => {
      for (const [, h] of hashes) h.update(chunk)
      crc = crc32(chunk, crc)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      const out = {}
      for (const [algo, h] of hashes) out[algo] = h.digest('hex')
      out.crc32 = hex32(crc)
      resolve(out)
    })
  })
}
