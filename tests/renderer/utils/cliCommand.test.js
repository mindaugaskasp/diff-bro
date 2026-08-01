import { describe, expect, it } from 'vitest'
import { clipboardSnippetName, tabsFullMessage } from '../../../src/renderer/src/utils/cliCommand'

describe('tabsFullMessage', () => {
  it('names the files that did not open, by basename', () => {
    const msg = tabsFullMessage(['/work/left.json', '/work/right.json'], 6)
    expect(msg).toContain('left.json and right.json')
    expect(msg).toContain('all 6 comparisons')
    expect(msg).toMatch(/Close one and try again/)
  })

  it('still reads as a sentence with one file', () => {
    expect(tabsFullMessage(['/work/only.json'], 6)).toContain('only.json —')
  })

  // A git comparison is the SAME filename twice, as a before and an after copy;
  // naming it "f7.txt and f7.txt" read like two files failed.
  it('collapses a name that appears on both sides', () => {
    const msg = tabsFullMessage(['/tmp/g/before/f7.txt', '/tmp/g/after/f7.txt'], 6)
    expect(msg).toContain("Can't open f7.txt —")
  })

  it('lists several blocked conflicts', () => {
    const paths = ['a.txt', 'b.txt', 'c.txt'].map((n) => `/tmp/g/before/${n}`)
    expect(tabsFullMessage(paths, 6)).toContain('a.txt, b.txt and c.txt')
  })

  // Past a handful the dialog is a wall of filenames; the count says it better.
  it('counts the tail once the list gets long', () => {
    const paths = Array.from({ length: 9 }, (_, i) => `/tmp/g/before/f${i}.txt`)
    const msg = tabsFullMessage(paths, 6)
    expect(msg).toContain('f0.txt, f1.txt, f2.txt, f3.txt, f4.txt and 4 more')
  })
})

describe('clipboardSnippetName', () => {
  it('is Clipboard - <date> <time>, zero-padded', () => {
    expect(clipboardSnippetName(new Date(2026, 7, 1, 9, 4))).toBe('Clipboard - 2026-08-01 09:04')
  })
})

// The app calls them comparisons everywhere a user can read — menus, the tab
// bar, the close dialog. A refusal that switches to "tabs" is a second name for
// the same thing.
describe('the words the refusal uses', () => {
  it('calls them comparisons, like the rest of the app', () => {
    const msg = tabsFullMessage(['/work/left.json'], 6)
    expect(msg).toContain('all 6 comparisons')
    expect(msg).not.toMatch(/\btabs?\b/i)
  })
})
