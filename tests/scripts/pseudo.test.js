import { describe, expect, it } from 'vitest'
import { pseudoText, pseudoTree } from '../../scripts/lib/pseudo.mjs'

// en-XA exists to make three failures visible that no unit test catches: text
// that was never extracted (it stays plain ASCII), a container that truncates
// (the padding overflows it), and a broken interpolation (the placeholder
// survives verbatim, so a mangled one is obvious).
describe('pseudoText', () => {
  it('brackets the message so an untranslated literal stands out', () => {
    const out = pseudoText('Save')
    expect(out.startsWith('[')).toBe(true)
    expect(out.endsWith(']')).toBe(true)
  })

  it('accents the letters, leaving the word recognizable', () => {
    const out = pseudoText('Save')
    expect(out).not.toContain('Save')
    expect(out).toMatch(/[ŠŞŚ].*[àáâ]/u)
  })

  it('pads, so a container that cannot take a longer language overflows here', () => {
    const out = pseudoText('Open Left')
    expect(out.length).toBeGreaterThan('Open Left'.length * 1.3)
  })

  // The whole point of a pseudolocale is that it still WORKS. A mangled
  // placeholder renders as literal text instead of the value.
  it('leaves an interpolation placeholder untouched', () => {
    expect(pseudoText('Sealed diff: {name}')).toContain('{name}')
    expect(pseudoText('Hello {name}, you have {n} files')).toContain('{name}')
    expect(pseudoText('Hello {name}, you have {n} files')).toContain('{n}')
  })

  it('keeps the plural separator, which is message syntax and not text', () => {
    const out = pseudoText('no files | one file | {n} files')
    expect(out.split('|')).toHaveLength(3)
  })

  it('keeps newlines, which carry layout in native dialogs', () => {
    expect(pseudoText('One\n\nTwo')).toContain('\n\n')
  })

  it('does not accent digits or punctuation', () => {
    expect(pseudoText('Zoom 100%')).toContain('100%')
  })
})

describe('pseudoTree', () => {
  it('walks nested groups and transforms only the leaves', () => {
    const out = pseudoTree({ menu: { file: { title: 'File' } }, common: { save: 'Save' } })
    expect(out.menu.file.title).toBe(pseudoText('File'))
    expect(out.common.save).toBe(pseudoText('Save'))
  })

  // A golden value, not self-comparison: the risk is the /g/ SYNTAX_SPLIT regex
  // carrying lastIndex between calls, which calling it twice cannot expose.
  it('is deterministic, so a committed en-XA.json has a stable diff', () => {
    expect(pseudoTree({ a: 'Hello {x}', b: { c: 'World' } })).toEqual({
      a: '[Ĥéłłō {x} ·øé]',
      b: { c: '[Ŵōřłđ ·ø]' }
    })
  })
})
