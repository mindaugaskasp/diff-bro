// A public key as clipboard TEXT — what "Copy to clipboard" produces and what
// a chat message delivers back. Pure: the Electron glue (keyExchange.js) reads
// the clipboard; this decides whether the text is a key. The fingerprint is
// always recomputed from the material — a stated one is never trusted.
import {
  cleanLabel,
  decodePublicKey,
  fingerprint,
  isAcceptedKeyFormat,
  rebuiltPublicKey
} from './sealing'

export const MAX_KEY_TEXT_BYTES = 64 * 1024

// Chat apps wrap a pasted block: code fences (with or without a language tag),
// single backticks, smart quotes around the JSON's own delimiters, whitespace.
const stripKeyWrapping = (raw) =>
  String(raw ?? '')
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/, '')
    .replace(/^`+|`+$/g, '')
    .trim()

/**
 * @param {string} text
 * @returns {{ key: object, fp: string, defaultLabel: string }}  throws when the text is not a key
 */
export function parseKeyText(text) {
  if (typeof text !== 'string' || text.length > MAX_KEY_TEXT_BYTES) throw new Error('too large')
  const stripped = stripKeyWrapping(text)
  if (!stripped) throw new Error('empty')
  const key = decodePublicKey(stripped)
  if (!isAcceptedKeyFormat(key.format) || !key.sign || !key.box) throw new Error('bad format')
  return {
    key: rebuiltPublicKey(key),
    fp: fingerprint(key.sign, key.box),
    defaultLabel: cleanLabel(key.label) || ''
  }
}
