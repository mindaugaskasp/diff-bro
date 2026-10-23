import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import { MAX_TABS, isBlank, isSnippetTab, stripTabs } from '../../../src/renderer/src/utils/tabs'

const FILE = (name) => ({ path: `/tmp/${name}`, name, content: 'x' })
const comparison = (l, r) => ({ mode: 'files', left: FILE(l), right: FILE(r) })

function withTabs(...comparisons) {
  const tabs = useTabsStore()
  tabs.init()
  for (const c of comparisons) tabs.open(c)
  return tabs
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('snippet tabs', () => {
  it('opens a snippet in the start surface rather than beside it', () => {
    const tabs = withTabs()
    tabs.openSnippet({ id: 's1' }, 'Notes')
    expect(tabs.tabs).toHaveLength(1)
    expect(isSnippetTab(tabs.active)).toBe(true)
    expect(tabs.active.title).toBe('Notes')
  })

  it('opens beside a comparison, and focuses an open snippet instead of duplicating it', () => {
    const tabs = withTabs(comparison('a', 'b'))
    const first = tabs.openSnippet({ id: 's1' }, 'Notes')
    tabs.activate(tabs.tabs[0].id)
    expect(tabs.openSnippet({ id: 's1' }, 'Notes')).toBe(first)
    expect(tabs.tabs).toHaveLength(2)
    expect(tabs.activeId).toBe(first)
  })

  it('leaves the comparison it opened beside untouched', () => {
    const tabs = withTabs(comparison('a', 'b'))
    tabs.openSnippet({ id: 's1' })
    tabs.activate(tabs.tabs[0].id)
    expect(useDiffStore().left.name).toBe('a')
  })

  it('never takes over a comparison built in the start surface', () => {
    const tabs = withTabs()
    const diff = useDiffStore()
    diff.left = FILE('a')
    diff.right = FILE('b')
    tabs.openSnippet({ id: 's1' })
    expect(tabs.tabs).toHaveLength(2)
    tabs.activate(tabs.tabs[0].id)
    expect(diff.left.name).toBe('a')
  })

  it('says so when every tab is in use', () => {
    const tabs = withTabs(
      ...Array.from({ length: MAX_TABS }, (_, i) => comparison(`l${i}`, `r${i}`))
    )
    expect(tabs.openSnippet({ id: 's1' })).toBeNull()
    expect(useDiffStore().notice).toMatch(/Close one first/)
  })

  it('asks before closing a snippet with unsaved changes', () => {
    const tabs = withTabs(comparison('a', 'b'))
    const id = tabs.openSnippet({ id: null })
    tabs.setSnippetMeta(id, { dirty: true })
    tabs.requestClose(id)
    expect(tabs.pendingClose).toEqual([id])
    tabs.setSnippetMeta(id, { dirty: false })
    tabs.cancelClose()
    tabs.requestClose(id)
    expect(tabs.tabs.some((t) => t.id === id)).toBe(false)
  })

  it('keeps the name it is given, whatever the comparison underneath does', () => {
    const tabs = withTabs()
    const id = tabs.openSnippet({ id: null })
    tabs.setSnippetMeta(id, { title: 'Draft' })
    tabs.syncActiveTitle()
    expect(tabs.active.title).toBe('Draft')
  })

  it('remembers the id a new snippet gets on its first save', () => {
    const tabs = withTabs()
    const id = tabs.openSnippet({ id: null })
    tabs.setSnippetMeta(id, { snippetId: 's9' })
    expect(tabs.active.snippet.id).toBe('s9')
  })
})

describe('closing the only tab', () => {
  it('turns a lone snippet tab back into the start surface', () => {
    const tabs = withTabs()
    const id = tabs.openSnippet({ id: 's1' })
    tabs.requestClose(id)
    expect(tabs.tabs).toHaveLength(1)
    expect(isSnippetTab(tabs.active)).toBe(false)
    expect(isBlank(tabs.active)).toBe(true)
  })
})

describe('the start surface', () => {
  it('is a blank comparison, and + returns to it rather than making another', () => {
    const tabs = withTabs(comparison('a', 'b'))
    tabs.showStart()
    expect(isBlank(tabs.active)).toBe(true)
    const blankId = tabs.activeId
    tabs.activate(tabs.tabs[0].id)
    tabs.showStart()
    expect(tabs.activeId).toBe(blankId)
    expect(tabs.tabs).toHaveLength(2)
    expect(stripTabs(tabs.tabs)).toHaveLength(1)
  })

  it('takes a file picked while a snippet is in front into a comparison tab', async () => {
    const tabs = withTabs()
    tabs.openSnippet({ id: 's1' })
    const diff = useDiffStore()
    diff.receive('left', FILE('a'))
    expect(isSnippetTab(tabs.active)).toBe(false)
    expect(tabs.tabs.some(isSnippetTab)).toBe(true)
    expect(diff.left.name).toBe('a')
  })
})

describe('the place in a comparison', () => {
  it('is kept on the tab when another is opened in front of it', async () => {
    const { setDiffScroller } = await import('../../../src/renderer/src/utils/diffScroller')
    setDiffScroller({ scrollTop: () => 640 })
    const tabs = withTabs(comparison('a', 'b'))
    const first = tabs.activeId
    tabs.openSnippet({ id: 's1' })
    setDiffScroller(null)
    expect(tabs.tabs.find((t) => t.id === first).scrollTop).toBe(640)
  })
})
