import { describe, expect, it } from 'vitest'
import {
  THEMES,
  DEFAULT_THEME,
  isValidTheme,
  isDarkTheme,
  normalizeTheme
} from '../../../src/renderer/src/utils/themes'

describe('themes registry', () => {
  it('offers the five named themes, Light first and the default', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['light', 'dark', 'solar', 'neon', 'contrast'])
    expect(DEFAULT_THEME).toBe('light')
    expect(THEMES[0].id).toBe(DEFAULT_THEME)
  })

  it('marks each theme dark- or light-ground (drives the editor/diagram theme)', () => {
    const dark = THEMES.filter((t) => t.dark).map((t) => t.id)
    expect(dark).toEqual(['dark', 'neon'])
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
