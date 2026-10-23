import { describe, expect, it } from 'vitest'
import {
  EDITOR_FONTS,
  fontStack,
  installedFonts,
  isEditorFont,
  isFontInstalled
} from '../../../src/renderer/src/utils/editorFonts'

// A fake canvas: a font is "installed" when it changes the measured width
// against both generic fallbacks.
const measureWith = (installed) => (css) => {
  const named = installed.find((f) => css.includes(`"${f}"`))
  if (named) return 100 + named.length
  return css.endsWith('serif') ? 80 : 90
}

describe('isFontInstalled', () => {
  it('is true when the family moves the width off both fallbacks', () => {
    expect(isFontInstalled('Menlo', measureWith(['Menlo']))).toBe(true)
  })
  it('is false when the browser fell back', () => {
    expect(isFontInstalled('Fira Code', measureWith(['Menlo']))).toBe(false)
  })
})

describe('installedFonts', () => {
  it('lists only the curated families that measure as installed, in list order', () => {
    const list = installedFonts(measureWith(['Menlo', 'Courier New']))
    expect(list).toEqual(EDITOR_FONTS.filter((f) => ['Menlo', 'Courier New'].includes(f)))
  })
})

describe('isEditorFont', () => {
  it('accepts a curated family or the default', () => {
    expect(isEditorFont('Menlo')).toBe(true)
    expect(isEditorFont('')).toBe(true)
  })
  it.each(['Comic Sans', 'x"; color: red', 42, null])('refuses %j', (v) => {
    expect(isEditorFont(v)).toBe(false)
  })
})

describe('fontStack', () => {
  it('quotes the family ahead of a monospace fallback', () => {
    expect(fontStack('JetBrains Mono')).toBe('"JetBrains Mono", monospace')
  })
  it('is empty for the default, so Monaco keeps its own', () => {
    expect(fontStack('')).toBe('')
  })
})
