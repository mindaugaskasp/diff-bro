// Finding a recipient among thirty. The scoring is NOT new: it projects a
// trusted key into the shape rank() already understands (utils/quickLook.js), so
// the picker, the palette and the sidebar agree on what a query finds. A fourth
// surface with its own matching rules would make the app disagree with itself.
//
// Label prefix (0) beats label substring (1) beats address or fingerprint
// substring (2) — `tags` is the band rank() gives those.
import { rank } from './quickLook'

const byLabel = (a, b) =>
  String(a.label ?? '').localeCompare(String(b.label ?? ''), undefined, { sensitivity: 'base' })

/**
 * Alphabetical by label, replacing the insertion order trusted-keys.json holds.
 * Sorted here rather than on disk so the crypto path never notices.
 * @param {object[]} keys
 * @returns {object[]}
 */
export const sortRecipients = (keys) => [...(keys ?? [])].sort(byLabel)

/**
 * @param {object[]} keys
 * @param {{ query?: string, withEmailOnly?: boolean }} [opts]
 * @returns {object[]} matches, best first; an empty query keeps alphabetical order
 */
export function filterRecipients(keys, { query = '', withEmailOnly = false } = {}) {
  const pool = sortRecipients(keys).filter((k) => !withEmailOnly || !!k.email)
  const scored = rank(
    query,
    pool.map((k) => ({ ...k, name: k.label, tags: [k.email, k.fingerprint].filter(Boolean) }))
  )
  // Hand back the ORIGINAL objects, not the projections: a `name`/`tags` pair
  // leaking into a component invites reading the wrong one of two labels.
  return scored.map((match) => pool.find((k) => k.fingerprint === match.fingerprint))
}
