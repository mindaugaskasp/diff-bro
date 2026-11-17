export const MAX_TTL_MS = 7 * 24 * 3600 * 1000
const CLOCK_SKEW_MS = 5 * 60 * 1000

// 'expired' | 'invalid-ttl' | null — enforced when signing AND when opening,
// so a shared diff can never outlive MAX_TTL_MS anywhere.
export function ttlError(entry, now = Date.now()) {
  if (!Number.isFinite(entry?.createdAt) || !Number.isFinite(entry?.expiresAt)) return 'invalid-ttl'
  if (entry.expiresAt <= now) return 'expired'
  if (entry.expiresAt - entry.createdAt > MAX_TTL_MS) return 'invalid-ttl'
  // Measured from now as well: a future createdAt would otherwise stretch the replay window.
  if (entry.expiresAt - now > MAX_TTL_MS + CLOCK_SKEW_MS) return 'invalid-ttl'
  return null
}
