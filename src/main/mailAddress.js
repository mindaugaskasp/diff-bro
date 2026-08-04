// Email address validation, in main and never in the renderer: an HTML
// type="email" is a hint to a user, not a gate on what reaches a header.
//
// The rule that matters is the CR/LF one. A stored address carrying "\r\nBcc:"
// would inject a second header into the mailto: URL we build, so anything with
// a control character is refused outright rather than stripped — stripping
// invites a second-order bug where the cleaned value is stored and trusted.

const MAX_EMAIL_LENGTH = 254 // RFC 5321 path limit
const MAX_LOCAL_LENGTH = 64

/**
 * @param {unknown} raw
 * @returns {string} trimmed, or '' for anything unusable
 */
export const normalizeEmail = (raw) => (typeof raw === 'string' ? raw.trim() : '')

// eslint-disable-next-line no-control-regex
const HAS_CONTROL = /[\u0000-\u001f\u007f]/
// Bidi overrides and invisible separators are not control characters and not
// whitespace, so they passed every other check — and then rendered the address
// REVERSED in the hand-off confirm box, which is the fence the user reads.
const HAS_DECEPTIVE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/
const HAS_DECEPTIVE_G = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g
// Whitespace, angle brackets, comma, semicolon: each one could turn a single
// stored field into two recipients or a second header.
const HAS_SEPARATOR = /[\s<>,;"\\]/
const OK_LOCAL = /^[^.](.*[^.])?$/
const OK_DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

const okLocal = (local) =>
  !!local && local.length <= MAX_LOCAL_LENGTH && OK_LOCAL.test(local) && !local.includes('..')

/**
 * Deliberately not an RFC-complete grammar: this rejects, it does not parse.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isValidEmail(raw) {
  const value = normalizeEmail(raw)
  if (!value || value.length > MAX_EMAIL_LENGTH) return false
  if (HAS_CONTROL.test(value) || HAS_SEPARATOR.test(value)) return false
  if (HAS_DECEPTIVE.test(value)) return false
  const at = value.indexOf('@')
  if (at < 1 || at !== value.lastIndexOf('@')) return false
  return okLocal(value.slice(0, at)) && OK_DOMAIN.test(value.slice(at + 1))
}

/**
 * A header-safe one-line string: control characters are what turn a subject into
 * an extra header, so they are collapsed rather than carried.
 * @param {unknown} raw
 * @param {number} max
 * @returns {string}
 */
export function headerText(raw, max = 200) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ') // eslint-disable-line no-control-regex
    .replace(HAS_DECEPTIVE_G, '')
    .trim()
    .slice(0, max)
}

/**
 * Multi-line body text: newlines are legal here (they are encoded into the
 * query string), but carriage returns and the other controls are not.
 * @param {unknown} raw
 * @param {number} max
 * @returns {string}
 */
export function bodyText(raw, max = 2000) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ') // eslint-disable-line no-control-regex
    .trim()
    .slice(0, max)
}
