import { describe, expect, it } from 'vitest'
import { errorMessage } from '../../../src/renderer/src/utils/shareErrors'
import { createTranslator } from '../../../src/shared/i18n'

const t = createTranslator('en')

// Two features report the SAME main-process error codes — a sealed diff and a
// sealed snippets export both fail with `bad-signature` and `bad-trusted-key`.
// The wording lived in two places (utils/shareErrors.js and snippetStore.js)
// with nothing keeping them equal.
describe('errorMessage', () => {
  it('gives one wording for a code both features raise', () => {
    for (const code of ['bad-signature', 'bad-trusted-key']) {
      expect(errorMessage(code, t)).toBe(errorMessage(code, t))
      expect(errorMessage(code, t)).not.toContain('shareErrors.')
    }
  })

  it('resolves every code to real copy, never a bare key id', () => {
    for (const code of ['not-for-you', 'tampered', 'expired', 'renamed', 'wrong-passphrase']) {
      const text = errorMessage(code, t)
      expect(text, code).toBeTruthy()
      expect(text, code).not.toMatch(/^shareErrors\./)
    }
  })

  // An unrecognised code must still say something, or the UI shows nothing at
  // all where a failure happened.
  it('falls back for a code it has never seen', () => {
    expect(errorMessage('who-knows', t)).toBe(t('shareErrors.fallback'))
    expect(errorMessage(undefined, t)).toBe(t('shareErrors.fallback'))
  })

  // One wording per code, but the fallback stays per-caller: "Sharing failed."
  // and "Import failed." say which of the two the user was doing.
  it('lets the caller choose the fallback', () => {
    expect(errorMessage('who-knows', t, 'shareErrors.sharingFailed')).toBe('Sharing failed.')
    expect(errorMessage('who-knows', t, 'shareErrors.importFailed')).toBe('Import failed.')
    expect(errorMessage('expired', t, 'shareErrors.sharingFailed')).toBe(t('shareErrors.expired'))
  })
})
