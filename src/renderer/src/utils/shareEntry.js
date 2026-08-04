// The sealable shape of a diff — what main signs and encrypts. Pure, so the
// expiry arithmetic and the tag rule are unit-tested without a store, and so the
// same shape is produced whether it comes from a saved entry or the current
// diff. vaultStore is glue over this.

// The kept/sealed ceiling lives here rather than in the store so utils/ stays
// importable on its own. Keep MAX_KEEP_HOURS in step with sealing.js MAX_TTL_MS:
// one ceiling for kept and sealed both.
export const DEFAULT_TTL_HOURS = 1
export const MAX_KEEP_HOURS = 168
export const MAX_KEEP_MS = MAX_KEEP_HOURS * 3600_000

/** Clamped on the way in, so no caller can exceed the ceiling. */
export const ttlSpan = (hours) =>
  Math.min(Math.max(hours || DEFAULT_TTL_HOURS, 0.1), MAX_KEEP_HOURS) * 3600_000

/**
 * The sender's own window, so both copies die together. A kept diff has none to
 * send and sealing demands a finite one, so it goes with a fresh full window.
 * @param {{ createdAt: number, expiresAt: number|null }} entry
 * @param {number} now
 * @returns {{ createdAt: number, expiresAt: number }}
 */
export function sealedWindow(entry, now) {
  if (entry.expiresAt === null) return { createdAt: now, expiresAt: now + MAX_KEEP_MS }
  return { createdAt: entry.createdAt, expiresAt: entry.expiresAt }
}

// Tags travel with the diff (inside the signed+encrypted payload) so the
// recipient sees them. The auto "imported" tag is local-only — sending it would
// make a re-shared diff accumulate them.
const sendableTags = (tags) => (tags ?? []).filter((t) => t !== 'imported')

/**
 * A saved entry plus its decrypted payload, ready to seal.
 * @returns {{ name: string, createdAt: number, expiresAt: number, snapshot: object, tags: string[] }}
 */
export function sealableFromEntry(entry, payload, now = Date.now()) {
  const { createdAt, expiresAt } = sealedWindow(entry, now)
  return { name: entry.name, createdAt, expiresAt, snapshot: payload, tags: sendableTags(entry.tags) }
}

/** The current diff, which has no saved entry yet. */
export function sealableFromDraft({ name, ttlHours, snapshot, tags }, now = Date.now()) {
  const localExpiresAt = ttlHours === null ? null : now + ttlSpan(ttlHours)
  const { expiresAt } = sealedWindow({ createdAt: now, expiresAt: localExpiresAt }, now)
  return { name, createdAt: now, expiresAt, snapshot, tags: sendableTags(tags) }
}
