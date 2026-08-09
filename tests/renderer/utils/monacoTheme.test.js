// Monaco owns the one surface a diff tool is judged on, and it was the one
// surface the palette never reached: the app defined no Monaco theme at all, so
// all seven dark themes rendered the stock #1e1e1e ground with the stock olive
// and maroon bands, and all seven light ones the stock white. Fourteen themes,
// two appearances.
import { describe, expect, it } from 'vitest'
import { MONACO_TOKENS, monacoThemeData } from '../../../src/renderer/src/utils/monacoTheme'

// What a DOM probe hands back: computed custom properties come out as rgb().
const tide = {
  '--bg': 'rgb(11, 26, 30)',
  '--text': 'rgb(226, 241, 242)',
  '--text-dim': 'rgb(143, 169, 174)',
  '--border': 'rgb(47, 76, 85)',
  '--accent': 'rgb(110, 210, 192)',
  '--diff-add-line': 'rgb(24, 51, 43)',
  '--diff-del-line': 'rgb(45, 40, 42)',
  '--diff-add-text': 'rgb(41, 82, 65)',
  '--diff-del-text': 'rgb(78, 57, 57)'
}
const amber = {
  ...tide,
  '--bg': 'rgb(13, 7, 0)',
  '--text': 'rgb(255, 213, 150)',
  '--diff-add-line': 'rgb(41, 46, 11)',
  '--diff-del-line': 'rgb(51, 22, 15)'
}

describe('monacoThemeData', () => {
  it('grounds the editor in the theme, not in Monaco stock', () => {
    const { colors } = monacoThemeData(tide, { dark: true })
    expect(colors['editor.background']).toBe('#0b1a1e')
    expect(colors['editor.foreground']).toBe('#e2f1f2')
  })

  // The whole bug in one assertion: two themes must not paint the same diff.
  it('gives two themes two different diffs', () => {
    const a = monacoThemeData(tide, { dark: true }).colors
    const b = monacoThemeData(amber, { dark: true }).colors
    expect(a['diffEditor.insertedLineBackground']).not.toBe(
      b['diffEditor.insertedLineBackground']
    )
    expect(a['editor.background']).not.toBe(b['editor.background'])
  })

  it('takes the diff bands from the tokens rather than inventing them', () => {
    const { colors } = monacoThemeData(tide, { dark: true })
    expect(colors['diffEditor.insertedLineBackground']).toBe('#18332b')
    expect(colors['diffEditor.removedLineBackground']).toBe('#2d282a')
    // The character-level band is the stronger of the pair, so a changed word
    // still reads inside an already-tinted line.
    expect(colors['diffEditor.insertedTextBackground']).toBe('#295241')
    expect(colors['diffEditor.removedTextBackground']).toBe('#4e3939')
  })

  it('inherits the right base so the syntax rules survive', () => {
    expect(monacoThemeData(tide, { dark: true }).base).toBe('vs-dark')
    expect(monacoThemeData(tide, { dark: false }).base).toBe('vs')
    expect(monacoThemeData(tide, { dark: true }).inherit).toBe(true)
  })

  it('accepts a hex token as readily as an rgb() one', () => {
    const { colors } = monacoThemeData({ ...tide, '--bg': '#0b1a1e' }, { dark: true })
    expect(colors['editor.background']).toBe('#0b1a1e')
  })

  // Monaco rejects a malformed colour by throwing out of defineTheme, which
  // would take the whole viewer with it.
  it('leaves out anything it cannot read rather than emitting a bad colour', () => {
    const { colors } = monacoThemeData({ ...tide, '--bg': 'oklch(0.2 0 0)' }, { dark: true })
    expect(colors['editor.background']).toBeUndefined()
    expect(colors['editor.foreground']).toBe('#e2f1f2')
    for (const value of Object.values(colors)) expect(value).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('names every token it needs, so one probe can read them all', () => {
    expect(MONACO_TOKENS).toEqual(expect.arrayContaining(Object.keys(tide)))
  })
})
