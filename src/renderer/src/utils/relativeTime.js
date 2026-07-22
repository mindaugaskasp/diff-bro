// Compact "3d / 2w / 5h" age from a timestamp. Not live — the callers render
// lists that are rebuilt often enough, and a coarse label recomputed on render
// is cheaper than a ticking clock per row.
/**
 * @param {number} ts epoch ms
 * @returns {string} compact age, e.g. "now", "5m", "3d"
 */
export function ago(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(d / 365)}y`
}
