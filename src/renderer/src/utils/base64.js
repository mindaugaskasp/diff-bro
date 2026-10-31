// Unicode-safe Base64 (btoa/atob only handle Latin1, so route through
// TextEncoder/Decoder). Encode takes options; decode is tolerant — it accepts
// standard or URL-safe input, strips whitespace/newlines, and re-pads.

/**
 * @param {string} text
 * @param {{ urlSafe?: boolean, wrap?: boolean }} [opts]
 * @returns {string}
 */
export function base64Encode(text, { urlSafe = false, wrap = false } = {}) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  let out = btoa(binary)
  if (urlSafe) out = out.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  if (wrap) out = out.match(/.{1,76}/g)?.join('\n') ?? out
  return out
}

// Throws if `text` isn't valid Base64 or doesn't decode to UTF-8 — callers catch.
/**
 * @param {string} text
 * @returns {string}
 */
export function base64Decode(text) {
  const cleaned = text.replace(/\s+/g, '').replaceAll('-', '+').replaceAll('_', '/')
  const pad = cleaned.length % 4 ? '='.repeat(4 - (cleaned.length % 4)) : ''
  const bytes = Uint8Array.from(atob(cleaned + pad), (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

const BASE64_RUN = /[A-Za-z0-9+/_-]{8,}={0,2}/g
const RUN_SYMBOL = /[-_+/]/g
const MIN_RUN_CHARS = 8
const MIN_SPLIT_PART_CHARS = 12
const MAX_SYMBOLS_SEARCHED = 16
const UNPRINTABLE = /[^\P{Cc}\t\n\r]|[\p{Cn}\p{Co}\p{Cs}]/u

function decodedPart(part, minChars) {
  if (part.replace(/=+$/, '').length < minChars) return null
  try {
    const decoded = base64Decode(part)
    return UNPRINTABLE.test(decoded) ? null : decoded
  } catch {
    return null
  }
}

function partBounds(run) {
  const symbols = [...run.matchAll(RUN_SYMBOL)].map((match) => match.index)
  const searched = symbols.length > MAX_SYMBOLS_SEARCHED ? [] : symbols
  return {
    starts: [0, ...searched.map((index) => index + 1)],
    ends: [run.length, ...searched.toReversed()]
  }
}

// A symbol may be data or a joiner like TEST-<part>, so the longest span that decodes wins.
function firstPart(run) {
  const { starts, ends } = partBounds(run)
  for (const start of starts) {
    for (const end of ends) {
      const part = run.slice(start, end)
      const decoded = decodedPart(part, part === run ? MIN_RUN_CHARS : MIN_SPLIT_PART_CHARS)
      if (decoded !== null) return { start, end, decoded }
    }
  }
  return null
}

function decodedRunParts(run) {
  const found = firstPart(run)
  if (!found) return run
  const joiner = run.slice(found.end, found.end + 1)
  const rest = decodedRunParts(run.slice(found.end + 1))
  return run.slice(0, found.start) + found.decoded + joiner + rest
}

// Throws when nothing decodes, like base64Decode, so callers report one way.
/**
 * @param {string} text
 * @returns {string} `text` with each Base64 part decoded and the rest untouched
 */
export function base64DecodeParts(text) {
  try {
    return base64Decode(text)
  } catch (wholeInputError) {
    const out = text.replace(BASE64_RUN, (run) => decodedRunParts(run))
    if (out === text) throw wholeInputError
    return out
  }
}

/**
 * @param {string} text
 * @returns {number} UTF-8 byte length
 */
export function byteLength(text) {
  return new TextEncoder().encode(text).length
}
