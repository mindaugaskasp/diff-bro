const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/**
 * A size a reader can hold in their head. One helper so the same number reads
 * the same wherever it appears.
 * @param {unknown} bytes
 * @returns {string}
 */
export function byteSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  let value = n
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  // Whole bytes only below 1 KB: "512.0 B" reads as a measurement error.
  return unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${UNITS[unit]}`
}
