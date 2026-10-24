import { describe, expect, it } from 'vitest'
import { closePromptKeys } from '../../../src/renderer/src/utils/tabClosePrompt'

const snippet = { kind: 'snippet' }
const comparison = { kind: 'diff' }

describe('closePromptKeys', () => {
  it('names an unsaved snippet as a snippet', () => {
    expect(closePromptKeys([snippet])).toEqual({
      titleKey: 'tabCloseDialog.closeSnippet',
      bodyKey: 'tabCloseDialog.closingOneSnippet'
    })
  })

  it('keeps the comparison wording for a comparison', () => {
    expect(closePromptKeys([comparison])).toEqual({
      titleKey: 'tabCloseDialog.closeComparison',
      bodyKey: 'tabCloseDialog.closingOne'
    })
  })

  it('says comparisons when every one at risk is a comparison', () => {
    expect(closePromptKeys([comparison, comparison])).toEqual({
      titleKey: 'tabCloseDialog.closeComparisons',
      bodyKey: 'tabCloseDialog.closingMany'
    })
  })

  it('says tabs when snippets are among them', () => {
    expect(closePromptKeys([comparison, snippet])).toEqual({
      titleKey: 'tabCloseDialog.closeTabs',
      bodyKey: 'tabCloseDialog.closingManyTabs'
    })
  })
})
