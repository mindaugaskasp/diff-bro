import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  LOCALES,
  allMessages,
  createTranslator,
  isLocale,
  normalizeLocale,
  preferredLocale
} from '../../../src/shared/i18n'
import en from '../../../src/shared/i18n/en.json'

const FIXTURE = {
  en: {
    greeting: 'Hello {name}',
    files: 'no files | one file | {n} files',
    nested: { deep: 'Found it' }
  },
  'en-XA': { nested: { deep: '[Ƒōūńđ ĩţ]' } }
}

describe('normalizeLocale', () => {
  it('keeps a locale the catalogue actually ships', () => {
    for (const { id } of LOCALES) expect(normalizeLocale(id)).toBe(id)
  })

  // The value arrives from settings.json, which a user can edit by hand. It
  // selects a key in a bundled object and must never pass an unknown one
  // through — that is what keeps it from reaching anything as a path.
  it('falls back to English for anything it does not ship', () => {
    for (const bad of ['fr', 'en-GB', '', '../en', null, undefined, 42, {}]) {
      expect(normalizeLocale(bad)).toBe(DEFAULT_LOCALE)
    }
  })

  it('does not treat an inherited Object property as a locale', () => {
    expect(isLocale('constructor')).toBe(false)
    expect(isLocale('toString')).toBe(false)
    expect(normalizeLocale('constructor')).toBe(DEFAULT_LOCALE)
  })
})

// Both processes answer "which locale do we start in?" the same way, so the
// rule lives here rather than twice. The OS tag is a full BCP-47 tag
// (`en-GB`, `lt-LT`) and almost never a locale we ship verbatim.
describe('preferredLocale', () => {
  it('prefers what the user actually chose', () => {
    expect(preferredLocale('en', 'lt-LT')).toBe('en')
  })

  it('falls back to the system tag when nothing is chosen', () => {
    expect(preferredLocale(undefined, 'en-GB')).toBe('en')
    expect(preferredLocale(null, 'en')).toBe('en')
  })

  it('falls back to English when neither is one we ship', () => {
    expect(preferredLocale('kl', 'kl-GL')).toBe(DEFAULT_LOCALE)
    expect(preferredLocale(undefined, undefined)).toBe(DEFAULT_LOCALE)
  })
})

describe('createTranslator', () => {
  it('interpolates named arguments', () => {
    const t = createTranslator('en', FIXTURE)
    expect(t('greeting', { name: 'Ada' })).toBe('Hello Ada')
  })

  it('resolves a dotted path into a nested group', () => {
    const t = createTranslator('en', FIXTURE)
    expect(t('nested.deep')).toBe('Found it')
  })

  // The reason a library is here at all: plural form selection is per-locale
  // and hand-rolling it is where the bugs live.
  it('selects the plural form for a count', () => {
    const t = createTranslator('en', FIXTURE)
    expect(t('files', 0)).toBe('no files')
    expect(t('files', 1)).toBe('one file')
    expect(t('files', 7)).toBe('7 files')
  })

  it('falls back to English for a key a locale has not translated', () => {
    const t = createTranslator('en-XA', FIXTURE)
    expect(t('nested.deep')).toBe('[Ƒōūńđ ĩţ]')
    expect(t('greeting', { name: 'Ada' })).toBe('Hello Ada')
  })

  // A missing key renders its own id rather than throwing or rendering empty.
  // The pseudolocale run depends on this: an id is visibly not a translation.
  it('returns the key id when nothing resolves', () => {
    const t = createTranslator('en', FIXTURE)
    expect(t('no.such.key')).toBe('no.such.key')
  })

  it('normalizes the locale it is handed', () => {
    expect(createTranslator('fr', FIXTURE)('greeting', { name: 'Ada' })).toBe('Hello Ada')
  })

  it('reads the shipped catalogue when no messages are supplied', () => {
    expect(createTranslator('en')('common.cancel')).toBe('Cancel')
  })
})

// Structural invariants of the catalogue itself. These are what stop a
// half-finished extraction shipping — an empty string renders as nothing at all
// and looks like a layout bug rather than a missing translation.
describe('en.json', () => {
  const leaves = (obj, path = []) =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' ? leaves(v, [...path, k]) : [[[...path, k].join('.'), v]]
    )

  it('has no empty or whitespace-only message', () => {
    const empty = leaves(en).filter(([, v]) => typeof v !== 'string' || !v.trim())
    expect(empty).toEqual([])
  })

  it('has no message left as a bare key id', () => {
    const idish = leaves(en).filter(([k, v]) => v === k)
    expect(idish).toEqual([])
  })

  it('is exposed as the English messages', () => {
    expect(allMessages()[DEFAULT_LOCALE]).toBe(en)
  })
})
