// Small, pure developer text tools that plug into TEXT_TOOLS (see textTools.js):
// each is a validate/format pair, kept here so it stays unit-testable. All are
// synchronous text→text — the shell dialog calls format() directly — so nothing
// that needs async (file hashing) or a second input (a regex tester) lives here.

// --- JWT decode ------------------------------------------------------------
function decodeSegment(seg) {
  let b64 = seg.replace(/-/g, '+').replace(/_/g, '/')
  b64 += '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(b64)
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/**
 * @param {string} text
 * @returns {import('../types').ValidationResult}
 */
export function validateJwt(text) {
  const parts = text.trim().split('.')
  if (parts.length !== 3) return { valid: false, error: 'a JWT has three dot-separated parts' }
  try {
    JSON.parse(decodeSegment(parts[0]))
    JSON.parse(decodeSegment(parts[1]))
  } catch {
    return { valid: false, error: 'header and payload must be base64url-encoded JSON' }
  }
  return { valid: true }
}

// header + payload as one pretty JSON object; the signature is opaque, so it is
// reported but never "decoded".
export function decodeJwt(text) {
  const parts = text.trim().split('.')
  if (parts.length < 2) return text
  try {
    return JSON.stringify(
      { header: JSON.parse(decodeSegment(parts[0])), payload: JSON.parse(decodeSegment(parts[1])) },
      null,
      2
    )
  } catch {
    return text
  }
}

// --- Unix epoch ↔ ISO date -------------------------------------------------
const DIGITS = /^\d{1,14}$/
// ≤ 11 digits is read as seconds (10-digit epochs run to year 2286), more as ms.
const epochToDate = (t) => new Date(t.length <= 11 ? Number(t) * 1000 : Number(t))

/**
 * @param {string} text
 * @returns {import('../types').ValidationResult}
 */
export function validateEpoch(text) {
  const t = text.trim()
  if (DIGITS.test(t)) return { valid: true }
  return Number.isNaN(Date.parse(t))
    ? { valid: false, error: 'not a Unix timestamp or a parseable date' }
    : { valid: true }
}

export function convertEpoch(text) {
  const t = text.trim()
  if (DIGITS.test(t)) return epochToDate(t).toISOString()
  const ms = Date.parse(t)
  return Number.isNaN(ms) ? text : String(Math.floor(ms / 1000))
}

// --- URL percent-encoding (toggle) -----------------------------------------
const HAS_PCT = /%[0-9a-fA-F]{2}/

/**
 * @param {string} text
 * @returns {import('../types').ValidationResult}
 */
export function validateUrlCode(text) {
  if (!HAS_PCT.test(text)) return { valid: true }
  try {
    decodeURIComponent(text)
    return { valid: true }
  } catch {
    return { valid: false, error: 'malformed percent-encoding' }
  }
}

export function convertUrlCode(text) {
  if (!HAS_PCT.test(text)) return encodeURIComponent(text)
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

// --- HTML entities (toggle) ------------------------------------------------
const ENCODE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const HAS_ENTITY = /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/

export function validateHtmlEntities() {
  return { valid: true }
}

export function convertHtmlEntities(text) {
  if (!HAS_ENTITY.test(text)) return text.replace(/[&<>"']/g, (c) => ENCODE[c])
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] !== '#') return NAMED[body] ?? m
    const isHex = body[1] === 'x' || body[1] === 'X'
    const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : m
  })
}
