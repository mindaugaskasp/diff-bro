// What each sealing failure means to a person. Kept out of the stores so the
// wording is reviewable on its own and each slice stays inside its size cap —
// these are copy, not logic.
//
// ONE table for both features: a sealed diff and a sealed snippets export come
// back with the same codes from main, and `bad-signature` / `bad-trusted-key`
// were written out twice with nothing keeping the two equal.
//
// Catalogue keys, not text: utils/ is pure and cannot import Vue, so the caller
// passes its translator in.
const ERROR_KEYS = {
  'not-a-share-file': 'shareErrors.notAShareFile',
  'not-for-you': 'shareErrors.notForYou',
  tampered: 'shareErrors.tampered',
  'unknown-signer': 'shareErrors.unknownSigner',
  'bad-signature': 'shareErrors.badSignature',
  'bad-trusted-key': 'shareErrors.badTrustedKey',
  expired: 'shareErrors.expired',
  'invalid-ttl': 'shareErrors.invalidTtl',
  'unknown-recipient': 'shareErrors.unknownRecipient',
  renamed: 'shareErrors.renamed',
  'identity-unavailable': 'shareErrors.identityUnavailable',
  'vault-key-unavailable': 'shareErrors.vaultKeyUnavailable',
  'not-a-snippet-file': 'shareErrors.notASnippetFile',
  'wrong-passphrase': 'shareErrors.wrongPassphrase',
  corrupted: 'shareErrors.corrupted',
  malformed: 'shareErrors.malformed',
  'too-large': 'shareErrors.tooLarge'
}

/**
 * The unified table gives one wording per code; the FALLBACK stays per-caller,
 * because "Sharing failed." and "Import failed." tell the user which of the two
 * things they were doing went wrong and a single generic line does not.
 *
 * @param {string} code the error code main returned
 * @param {(key: string) => string} translate
 * @param {string} [fallbackKey] copy for a code this build has never seen
 * @returns {string} never an empty string, whatever arrives
 */
export const errorMessage = (code, translate, fallbackKey = 'shareErrors.fallback') =>
  translate(ERROR_KEYS[code] ?? fallbackKey)
