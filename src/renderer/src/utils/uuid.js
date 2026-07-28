// UUID convert tool: toggles between the canonical 8-4-4-4-12 string and the
// 32-hex "binary" form (the BINARY(16) representation databases store). Pure, so
// it stays unit-testable.

const CANONICAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Strip one layer of surrounding braces (a common wrapper) and outer whitespace.
const unwrap = (text) => text.trim().replace(/^\{([\s\S]*)\}$/, '$1').trim()

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
