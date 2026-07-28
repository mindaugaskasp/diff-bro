import { describe, it, expect } from 'vitest'
import { parseTemplateVars, fillTemplate } from '../../../src/renderer/src/utils/templateVars'

describe('parseTemplateVars', () => {
  it('returns distinct names in first-seen order, tolerating inner whitespace', () => {
    const t = 'Review {{ file }} for {{issue}}, then re-check {{file}}.'
    expect(parseTemplateVars(t)).toEqual(['file', 'issue'])
  })

  it('is empty for text with no placeholders or nullish input', () => {
    expect(parseTemplateVars('no vars here')).toEqual([])
    expect(parseTemplateVars('')).toEqual([])
    expect(parseTemplateVars(null)).toEqual([])
  })
})

describe('fillTemplate', () => {
  it('substitutes provided values and reuses one value everywhere', () => {
    const t = '{{lang}} review of {{file}} ({{lang}})'
    expect(fillTemplate(t, { lang: 'Go', file: 'main.go' })).toBe('Go review of main.go (Go)')
  })

  it('leaves an unfilled or blank placeholder intact, not blanked', () => {
    expect(fillTemplate('hi {{name}}', {})).toBe('hi {{name}}')
    expect(fillTemplate('hi {{name}}', { name: '' })).toBe('hi {{name}}')
  })
})
