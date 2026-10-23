import { describe, expect, it } from 'vitest'
import {
  createSnippetTab,
  createTab,
  isBlank,
  isSnippetTab,
  stripTabs,
  tabForSnippet
} from '../../../src/renderer/src/utils/tabs'
import { packSession, readSession, tabFromStored } from '../../../src/renderer/src/utils/session'

const fileTab = () =>
  createTab({
    mode: 'files',
    left: { name: 'a.json', content: '{}' },
    right: { name: 'b.json', content: '[]' }
  })

describe('snippet tabs', () => {
  it('is a snippet tab, and never blank even though it holds no comparison', () => {
    const tab = createSnippetTab({ snippetId: 's1', title: 'Notes' })
    expect(isSnippetTab(tab)).toBe(true)
    expect(isBlank(tab)).toBe(false)
    expect(tab.title).toBe('Notes')
  })

  it('takes its title from the name it was given, never from content', () => {
    const tab = createSnippetTab({ snippetId: null, initial: { content: 'sk-live-123' } })
    expect(tab.title).toBe('')
  })

  it('finds the tab already holding a snippet', () => {
    const tabs = [fileTab(), createSnippetTab({ snippetId: 's1' })]
    expect(tabForSnippet(tabs, 's1')).toBe(tabs[1])
    expect(tabForSnippet(tabs, 's2')).toBeUndefined()
    expect(tabForSnippet(tabs, null)).toBeUndefined()
  })

  it('asks the live document about the active tab, whose stored copy is stale', () => {
    const blank = createTab()
    const tabs = [fileTab(), blank]
    expect(stripTabs(tabs, { activeId: blank.id, hasContent: true })).toHaveLength(2)
    expect(stripTabs(tabs, { activeId: blank.id, hasContent: false })).toHaveLength(1)
  })

  it('leaves blank comparisons out of the strip: they are the start surface', () => {
    const blank = createTab()
    const tabs = [fileTab(), blank, createSnippetTab({ snippetId: 's1' })]
    expect(stripTabs(tabs).map((t) => t.id)).toEqual([tabs[0].id, tabs[2].id])
  })
})

describe('snippet tabs in the session', () => {
  it('keeps a saved snippet tab by id only, and drops an unsaved draft', () => {
    const saved = createSnippetTab({ snippetId: 's1', title: 'Notes' })
    const draft = createSnippetTab({ snippetId: null, initial: { content: 'secret body' } })
    const packed = packSession([fileTab(), saved, draft], saved.id)
    const text = JSON.stringify(packed)
    expect(text).not.toContain('secret body')
    expect(text).not.toContain('Notes')
    expect(packed.tabs.map((t) => t.kind ?? 'diff')).toEqual(['diff', 'snippet'])
  })

  it('restores a snippet tab, active where it was', () => {
    const saved = createSnippetTab({ snippetId: 's1' })
    const read = readSession(JSON.stringify(packSession([fileTab(), saved], saved.id)))
    const restored = read.tabs.map(tabFromStored)
    expect(isSnippetTab(restored[1])).toBe(true)
    expect(restored[1].snippet.id).toBe('s1')
    expect(read.tabs[1].active).toBe(true)
  })

  it('drops a stored snippet tab with no usable id', () => {
    const text = JSON.stringify({ version: 1, tabs: [{ kind: 'snippet', snippetId: 42 }] })
    expect(readSession(text)).toBeNull()
  })
})
