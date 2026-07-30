// UUID convert tool: toggles between the canonical 8-4-4-4-12 string and the
// 32-hex "binary" form (the BINARY(16) representation databases store). Pure, so
// it stays unit-testable.

const CANONICAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Strip one layer of surrounding braces (a common wrapper) and outer whitespace.
const unwrap = (text) =>
  text
    .trim()
    .replace(/^\{([\s\S]*)\}$/, '$1')
    .trim()

// The 32-hex form, tolerating an 0x prefix and inner whitespace; null if not one.
function bareHex(text) {
  const hex = text.replace(/^0x/i, '').replace(/\s+/g, '')
  return /^[0-9a-f]{32}$/i.test(hex) ? hex.toLowerCase() : null
}

const toCanonical = (h) =>
  `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`

/**
 * @param {string} text
 * @returns {import('../types').ValidationResult}
 */
export function validateUuid(text) {
  const t = unwrap(text)
  if (CANONICAL.test(t) || bareHex(t)) return { valid: true }
  return { valid: false, error: 'expected the 8-4-4-4-12 canonical form or 32 hex digits' }
}

// Canonical → 32-hex, and any accepted binary form → canonical. Input the tool
// already validated; returns it unchanged otherwise.
export function convertUuid(text) {
  const t = unwrap(text)
  if (CANONICAL.test(t)) return t.replace(/-/g, '').toLowerCase()
  const hex = bareHex(t)
  return hex ? toCanonical(hex) : text
}

// --- generation & inspection -------------------------------------------------
// v1/v6 (time-based), v4 (random), v7 (Unix-time-ordered), v5 (deterministic).
// v5 hashes with Web Crypto — a public digest, no key material — so it also runs
// inline in the launcher; the others are synchronous.

export const UUID_NAMESPACES = {
  DNS: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  URL: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  OID: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  X500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8'
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))
const GREGORIAN_OFFSET = 12219292800000n // ms from 1582-10-15 to the Unix epoch

const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))

function bytesToUuid(b) {
  let s = ''
  for (let i = 0; i < 16; i++) {
    s += HEX[b[i]]
    if (i === 3 || i === 5 || i === 7 || i === 9) s += '-'
  }
  return s
}

export function uuidToBytes(uuid) {
  const hex = String(uuid).replace(/[^0-9a-f]/gi, '')
  const b = new Uint8Array(16)
  for (let i = 0; i < 16; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0
  return b
}

// The RFC-4122 variant (10xx) and a version nibble, then stringified.
function stamp(b, version) {
  b[6] = (b[6] & 0x0f) | (version << 4)
  b[8] = (b[8] & 0x3f) | 0x80
  return bytesToUuid(b)
}

export function uuidV4() {
  return stamp(randomBytes(16), 4)
}

// 48-bit Unix-ms prefix makes v7 sortable; the remaining bytes are random.
export function uuidV7(now = Date.now()) {
  const b = randomBytes(16)
  const t = BigInt(now)
  for (let i = 0; i < 6; i++) b[i] = Number((t >> BigInt(40 - i * 8)) & 0xffn)
  return stamp(b, 7)
}

// clock-seq (random) + variant, and a random 48-bit node with the multicast bit
// set (RFC 4122 §4.5) so it never clashes with a real MAC address.
function clockAndNode(b, rnd) {
  b[8] = (rnd[8] & 0x3f) | 0x80
  b[9] = rnd[9]
  b[10] = rnd[10] | 0x01
  for (let i = 11; i < 16; i++) b[i] = rnd[i]
}

const gregorianTicks = (now) => ((BigInt(now) + GREGORIAN_OFFSET) * 10000n) & 0x0fffffffffffffffn

export function uuidV1(now = Date.now()) {
  const ts = gregorianTicks(now)
  const rnd = randomBytes(16)
  const b = new Uint8Array(16)
  const low = ts & 0xffffffffn
  const mid = (ts >> 32n) & 0xffffn
  const hi = (ts >> 48n) & 0x0fffn
  b[0] = Number((low >> 24n) & 0xffn)
  b[1] = Number((low >> 16n) & 0xffn)
  b[2] = Number((low >> 8n) & 0xffn)
  b[3] = Number(low & 0xffn)
  b[4] = Number((mid >> 8n) & 0xffn)
  b[5] = Number(mid & 0xffn)
  b[6] = Number((hi >> 8n) & 0x0fn) | 0x10
  b[7] = Number(hi & 0xffn)
  clockAndNode(b, rnd)
  return bytesToUuid(b)
}

// v6 is v1 with the timestamp most-significant-first, so v6 UUIDs sort by time.
export function uuidV6(now = Date.now()) {
  const ts = gregorianTicks(now)
  const rnd = randomBytes(16)
  const b = new Uint8Array(16)
  const high = (ts >> 12n) & 0xffffffffffffn
  const low = ts & 0x0fffn
  for (let i = 0; i < 6; i++) b[i] = Number((high >> BigInt(40 - i * 8)) & 0xffn)
  b[6] = Number((low >> 8n) & 0x0fn) | 0x60
  b[7] = Number(low & 0xffn)
  clockAndNode(b, rnd)
  return bytesToUuid(b)
}

// Deterministic: SHA-1(namespace ‖ name), first 16 bytes, stamped v5.
export async function uuidV5(namespace, name) {
  const ns = uuidToBytes(namespace)
  const nm = new TextEncoder().encode(String(name))
  const data = new Uint8Array(ns.length + nm.length)
  data.set(ns, 0)
  data.set(nm, ns.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', data))
  return stamp(digest.slice(0, 16), 5)
}

export function formatUuid(uuid, { form = 'canonical', upper = false } = {}) {
  let id = String(uuid).toLowerCase()
  if (upper) id = id.toUpperCase()
  if (form === 'hex') return id.replace(/-/g, '')
  if (form === 'urn') return `urn:uuid:${id}`
  if (form === 'braced') return `{${id}}`
  return id
}

const VARIANTS = ['NCS', 'NCS', 'NCS', 'NCS', 'RFC 4122', 'RFC 4122', 'Microsoft', 'reserved']

export function uuidInfo(uuid) {
  const b = uuidToBytes(uuid)
  return { version: b[6] >> 4, variant: VARIANTS[b[8] >> 5] }
}

// Any accepted form (canonical, 32-hex, {braced}, urn:uuid:, 0x-prefixed) →
// canonical, or '' if it isn't a UUID — so the panel converts in either direction.
export function toCanonicalUuid(text) {
  const t = String(text)
    .trim()
    .toLowerCase()
    .replace(/^urn:uuid:/, '')
    .replace(/^\{|\}$/g, '')
    .replace(/^0x/, '')
    .replace(/-/g, '')
  return /^[0-9a-f]{32}$/.test(t) ? toCanonical(t) : ''
}
