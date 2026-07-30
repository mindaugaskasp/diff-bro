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

/**
 * @param {string} text
 * @returns {number} UTF-8 byte length
 */
export function byteLength(text) {
  return new TextEncoder().encode(text).length
}
