import { describe, expect, it } from 'vitest'
import { clipboardSnippetName, tabsFullMessage } from '../../../src/renderer/src/utils/cliCommand'

describe('tabsFullMessage', () => {
  it('names the files that did not open, by basename', () => {
    const msg = tabsFullMessage(['/work/left.json', '/work/right.json'], 6)
    expect(msg).toContain('left.json and right.json')
    expect(msg).toContain('all 6 tabs')
    expect(msg).toMatch(/Close a tab and try again/)
  })

  it('still reads as a sentence with one file', () => {
    expect(tabsFullMessage(['/work/only.json'], 6)).toContain('only.json —')
  })
})

describe('clipboardSnippetName', () => {
  it('is Clipboard - <date> <time>, zero-padded', () => {
    expect(clipboardSnippetName(new Date(2026, 7, 1, 9, 4))).toBe('Clipboard - 2026-08-01 09:04')
  })
})
