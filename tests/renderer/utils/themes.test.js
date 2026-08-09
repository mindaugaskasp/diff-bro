import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  THEMES,
  DEFAULT_THEME,
  themeForDay,
  isValidTheme,
  isDarkTheme,
  normalizeTheme
} from '../../../src/renderer/src/utils/themes'

describe('themes registry', () => {
  it('offers the named themes, Light first and the default', () => {
    expect(THEMES.map((t) => t.id)).toEqual([
      'light',
      'dark',
      'solar',
      'neon',
      'contrast',
      'nord',
      'sepia',
      'dim',
      'beacon',
      'meridian',
      'linen',
      'bloom',
      'nyan',
      'matrix',
      'volcano'
    ])
    expect(DEFAULT_THEME).toBe('light')
    expect(THEMES[0].id).toBe(DEFAULT_THEME)
  })

  it('marks each theme dark- or light-ground (drives the editor/diagram theme)', () => {
    const dark = THEMES.filter((t) => t.dark).map((t) => t.id)
    expect(dark).toEqual(['dark', 'neon', 'nord', 'dim', 'beacon', 'nyan', 'matrix', 'volcano'])
    expect(isDarkTheme('neon')).toBe(true)
    expect(isDarkTheme('solar')).toBe(false)
    expect(isDarkTheme('nope')).toBe(false)
  })

  it('validates ids and normalizes unknown/absent ones to the default', () => {
    expect(isValidTheme('contrast')).toBe(true)
    expect(isValidTheme('midnight')).toBe(false)
    expect(normalizeTheme('solar')).toBe('solar')
    expect(normalizeTheme('midnight')).toBe(DEFAULT_THEME)
    expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME)
  })

  it('gives every theme a preview swatch for the picker', () => {
    for (const t of THEMES) {
      expect(t.label).toBeTruthy()
      for (const k of ['bg', 'accent', 'add', 'del']) {
        expect(t.swatch[k]).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })
})

// Native controls (checkboxes, selects, scrollbars) take their appearance from
// color-scheme, which is declared per theme in themes.css beside the palette it
// has to agree with. `dark` in this registry is the other half of that fact, so
// the two can drift — and while nothing declared it at all, every dark theme
// painted a ticked checkbox as a light-mode box on a near-black toolbar.
describe('color-scheme agrees with the registry', () => {
  // Vitest runs from the repo root; import.meta.url is not a file URL here.
  const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/themes.css'), 'utf8')
  // The bare :root carries the Light palette and is the pre-JS default.
  const declared = (id) => {
    const selector = id === DEFAULT_THEME ? ':root \\{' : `:root\\[data-theme='${id}'\\] \\{`
    const block = new RegExp(`${selector}([^}]*)\\}`).exec(css)
    return block ? /color-scheme:\s*(light|dark)/.exec(block[1])?.[1] : undefined
  }

  it('declares one for every theme in the registry', () => {
    expect(THEMES.filter((t) => !declared(t.id)).map((t) => t.id)).toEqual([])
  })

  it('matches each theme dark/light flag', () => {
    const wrong = THEMES.filter((t) => declared(t.id) !== (t.dark ? 'dark' : 'light'))
    expect(wrong.map((t) => `${t.id}: ${declared(t.id)}`)).toEqual([])
  })
})

describe('themeForDay', () => {
  it('is stable within a day and returns a valid theme id', () => {
    const d = new Date(2026, 6, 23)
    const a = themeForDay(d)
    const b = themeForDay(new Date(2026, 6, 23, 18, 30))
    expect(a).toBe(b) // same calendar day -> same theme
    expect(isValidTheme(a)).toBe(true)
  })

  it('varies across days and covers the registry over time', () => {
    const seen = new Set()
    for (let i = 0; i < 60; i++) seen.add(themeForDay(new Date(2026, 0, 1 + i)))
    expect(seen.size).toBeGreaterThan(1) // not stuck on one theme
    for (const id of seen) expect(isValidTheme(id)).toBe(true)
  })
})
