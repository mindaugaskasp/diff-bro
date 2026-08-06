import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_TOKENS,
  expandTemplates,
  hasTemplate
} from '../../../src/renderer/src/utils/snippetTemplates'

// Wednesday 5 August 2026, 14:32 local.
const AT = new Date(2026, 7, 5, 14, 32)
const expand = (text, now = AT) => expandTemplates(text, { now, locale: 'en-GB' })

describe('expandTemplates', () => {
  it('resolves the date tokens to something sortable', () => {
    expect(expand('Notes {{today}}')).toBe('Notes 2026-08-05')
    expect(expand('{{yesterday}}')).toBe('2026-08-04')
    expect(expand('{{tomorrow}}')).toBe('2026-08-06')
    expect(expand('{{year}}')).toBe('2026')
  })

  it('resolves the clock tokens', () => {
    expect(expand('{{time}}')).toBe('14:32')
    expect(expand('{{now}}')).toBe('2026-08-05 14:32')
  })

  it('resolves the named tokens through the locale', () => {
    expect(expand('{{weekday}}')).toBe('Wednesday')
    expect(expand('{{month}}')).toBe('August')
    expect(expandTemplates('{{weekday}}', { now: AT, locale: 'de-DE' })).toBe('Mittwoch')
  })

  it('pads single digits, so names sort as text', () => {
    expect(expand('{{today}}', new Date(2026, 0, 3, 9, 5))).toBe('2026-01-03')
    expect(expand('{{time}}', new Date(2026, 0, 3, 9, 5))).toBe('09:05')
  })

  it('replaces every occurrence, not just the first', () => {
    expect(expand('{{today}} → {{today}}')).toBe('2026-08-05 → 2026-08-05')
  })

  it('tolerates the spacing a person actually types', () => {
    expect(expand('{{ today }}')).toBe('2026-08-05')
    expect(expand('{{TODAY}}')).toBe('2026-08-05')
  })

  // Blanking it would throw away what the person meant to keep, and they would
  // not find out until the snippet was already saved under the wrong name.
  it('leaves an unknown token exactly as typed', () => {
    expect(expand('Build {{version}}')).toBe('Build {{version}}')
    expect(expand('{{}}')).toBe('{{}}')
  })

  it('leaves ordinary text alone', () => {
    expect(expand('Just a name')).toBe('Just a name')
    expect(expand('')).toBe('')
    expect(expandTemplates(null)).toBe('')
    expect(expandTemplates(undefined)).toBe('')
  })
})

describe('isoWeek, through {{week}}', () => {
  it('numbers an ordinary week', () => {
    expect(expand('{{week}}')).toBe('2026-W32')
  })

  // The rule that makes ISO weeks worth writing down: a week belongs to the year
  // of its Thursday, so these two January dates report different years.
  it('gives a 1 January the year of its Thursday', () => {
    // Fri 1 Jan 2027 — its Thursday is 31 Dec 2026, so week 53 of 2026.
    expect(expand('{{week}}', new Date(2027, 0, 1))).toBe('2026-W53')
    // Thu 1 Jan 2026 is its own Thursday, so week 1 of 2026.
    expect(expand('{{week}}', new Date(2026, 0, 1))).toBe('2026-W01')
  })

  it('numbers the last week of a year without wrapping to zero', () => {
    expect(expand('{{week}}', new Date(2026, 11, 28))).toBe('2026-W53')
  })
})

describe('hasTemplate', () => {
  it('answers the same way twice — a /g/ regex would not', () => {
    expect(hasTemplate('a {{today}} b')).toBe(true)
    expect(hasTemplate('a {{today}} b')).toBe(true)
  })

  it('is false for text with nothing to expand', () => {
    expect(hasTemplate('plain')).toBe(false)
    expect(hasTemplate('{{ }}')).toBe(false)
    expect(hasTemplate(null)).toBe(false)
  })
})

describe('TEMPLATE_TOKENS', () => {
  // The hint renders these, and a translated string baked in at module load
  // would freeze the language the app started in.
  it('carries catalogue keys, never translated labels', () => {
    for (const spec of TEMPLATE_TOKENS) {
      expect(spec.labelKey).toMatch(/^snippetTemplates\./)
    }
  })

  it('every listed token actually resolves', () => {
    for (const spec of TEMPLATE_TOKENS) {
      expect(expand(`{{${spec.token}}}`)).not.toBe(`{{${spec.token}}}`)
    }
  })
})
