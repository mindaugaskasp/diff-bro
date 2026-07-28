import { describe, it, expect } from 'vitest'
import {
  languageMonogram,
  isMappedLanguage,
  MONOGRAM_FAMILIES
} from '../../../src/renderer/src/utils/languageMonogram'

describe('languageMonogram', () => {
  it('maps known languages to a label and family tint', () => {
    expect(languageMonogram('typescript')).toEqual({ label: 'TS', family: MONOGRAM_FAMILIES.code })
    expect(languageMonogram('mermaid')).toEqual({ label: 'MMD', family: MONOGRAM_FAMILIES.diagram })
    expect(languageMonogram('sql')).toEqual({ label: 'SQL', family: MONOGRAM_FAMILIES.db })
    expect(languageMonogram('json')).toEqual({ label: 'JSON', family: MONOGRAM_FAMILIES.data })
    expect(languageMonogram('claude')).toEqual({ label: 'CL', family: MONOGRAM_FAMILIES.ai })
  })

  it('maps diff format ids the same way (excel, yaml)', () => {
    expect(languageMonogram('excel').label).toBe('XLSX')
    expect(languageMonogram('yaml')).toEqual({ label: 'YAML', family: MONOGRAM_FAMILIES.data })
  })

  it('is case- and whitespace-insensitive', () => {
    expect(languageMonogram('  Python ')).toEqual({ label: 'PY', family: MONOGRAM_FAMILIES.code })
  })

  it('falls back to an uppercased stub for unknown languages', () => {
    expect(languageMonogram('kotlin')).toEqual({ label: 'KOTL', family: MONOGRAM_FAMILIES.docs })
  })

  it('returns TXT for empty / nullish input', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(languageMonogram(v)).toEqual({ label: 'TXT', family: MONOGRAM_FAMILIES.docs })
    }
  })

  it('isMappedLanguage tells a real format tag from an ordinary one', () => {
    expect(isMappedLanguage('json')).toBe(true)
    expect(isMappedLanguage('YAML')).toBe(true)
    expect(isMappedLanguage('release')).toBe(false)
    expect(isMappedLanguage(null)).toBe(false)
  })
})
