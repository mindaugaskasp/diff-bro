// Reading a checksum, rather than computing one — the digests come from main
// (src/main/hashing.js). Pure, so the matching rule is unit-testable.

export const HASH_LABELS = {
  md5: 'MD5',
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha512: 'SHA-512',
  crc32: 'CRC32'
}

// A digest people paste has usually been through a webpage, an email, or a
// `sha256sum` line — so it arrives with spaces, a filename after it, or in the
// other case. None of that is a mismatch.
const normalize = (value) =>
  String(value ?? '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()

/**
 * Which algorithm the pasted digest is, if any.
 * @param {string} expected
 * @param {Record<string, string>} digests
 * @returns {{ algorithm: string|null, checked: boolean }}
 */
export function matchingAlgorithm(expected, digests) {
  const want = normalize(expected)
  if (!want) return { algorithm: null, checked: false }
  for (const [algo, digest] of Object.entries(digests ?? {})) {
    if (digest && digest.toLowerCase() === want) return { algorithm: algo, checked: true }
  }
  return { algorithm: null, checked: true }
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function fileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = n
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}
