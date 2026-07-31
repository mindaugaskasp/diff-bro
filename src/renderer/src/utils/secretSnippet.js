// Secret snippets: an API key or token you want in the library without it
// sitting on screen every time you pass the row.
//
// This is MASKING, not a second lock. Every snippet is already AES-GCM encrypted
// at rest with the key behind the OS keychain; marking one secret changes what
// the app draws, not what an attacker with the vault key could read. What it
// buys is that the contents never appear in a hover card, a launcher preview, or
// over your shoulder — and that copying still works without ever showing them.

// Fixed width on purpose. A mask that tracked the real length would publish how
// long the secret is to anyone glancing at the screen, which is a genuine hint —
// a 4-character PIN and a 64-character token would look nothing alike.
export const SECRET_MASK = '************'

export const SECRET_NOTICE = 'Hidden — copy it to use it.'

/**
 * True when this entry's contents must never be drawn.
 * @param {{ secret?: boolean }} [entry]
 * @returns {boolean}
 */
export const isSecret = (entry) => entry?.secret === true

/**
 * What a preview surface should display for an entry: the mask for a secret,
 * otherwise the text it was given. Callers skip decrypting a secret entirely —
 * this is the fallback that keeps plaintext out of a preview even if one didn't.
 * @param {{ secret?: boolean }} [entry]
 * @param {string} [text]
 * @returns {string}
 */
export function previewText(entry, text) {
  return isSecret(entry) ? SECRET_MASK : (text ?? '')
}
