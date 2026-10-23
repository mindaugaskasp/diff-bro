// MACed: a plain settings flag would let any process that can write it bypass the keychain ACL.
import { createHmac, hkdfSync, timingSafeEqual } from 'crypto'

export const SCOPES = ['snippets', 'diffs', 'compare', 'proposeSnippets', 'proposeDiffs']

export const GRANT_OFF = Object.freeze({
  enabled: false,
  scopes: Object.freeze(Object.fromEntries(SCOPES.map((s) => [s, false])))
})

const grantKey = (vaultKey) =>
  Buffer.from(hkdfSync('sha256', vaultKey, Buffer.alloc(0), 'diffbro-claude-grant/1', 32))

const scopesOf = (scopes) => Object.fromEntries(SCOPES.map((s) => [s, scopes?.[s] === true]))

const canonical = ({ enabled, scopes, at }) =>
  JSON.stringify({ v: 1, enabled, scopes: SCOPES.map((s) => [s, scopes[s]]), at })

const macOf = (vaultKey, body) =>
  createHmac('sha256', grantKey(vaultKey)).update(canonical(body)).digest('base64')

/**
 * @param {Buffer} vaultKey
 * @param {{ enabled: boolean, scopes: Record<string, boolean> }} grant
 * @param {number} now
 */
export function signGrant(vaultKey, grant, now) {
  const body = { enabled: grant.enabled === true, scopes: scopesOf(grant.scopes), at: now }
  return { ...body, mac: macOf(vaultKey, body) }
}

const isRecordShape = (r) =>
  r !== null &&
  typeof r === 'object' &&
  typeof r.enabled === 'boolean' &&
  typeof r.at === 'number' &&
  typeof r.mac === 'string' &&
  r.scopes !== null &&
  typeof r.scopes === 'object'

function isAuthentic(vaultKey, record) {
  const expected = Buffer.from(macOf(vaultKey, { ...record, scopes: scopesOf(record.scopes) }))
  const given = Buffer.from(record.mac)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/**
 * @param {Buffer} vaultKey
 * @param {unknown} record  as read from disk
 * @returns {{ enabled: boolean, scopes: Record<string, boolean> }}
 */
export function verifyGrant(vaultKey, record) {
  if (!isRecordShape(record) || !record.enabled) return GRANT_OFF
  if (!isAuthentic(vaultKey, record)) return GRANT_OFF
  return { enabled: true, scopes: scopesOf(record.scopes) }
}
