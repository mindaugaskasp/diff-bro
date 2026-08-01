import { describe, expect, it } from 'vitest'
import {
  MAX_TABS,
  MAX_LIVE_CHARS,
  tabCost,
  tabsCost,
  tabsFullNotice,
  MAX_TAB_NAME,
  cleanTabName,
  tabLabel,
  canAddTab,
  createTab,
  isBlank,
  nextActiveId,
  tabForEntry,
  tabTitle
} from '../../../src/renderer/src/utils/tabs'

const file = (name) => ({ path: `/tmp/${name}`, name, content: 'x' })

describe('tabTitle', () => {
  it('names a comparison by both sides', () => {
    expect(tabTitle({ left: file('a.json'), right: file('b.json') })).toBe('a.json ↔ b.json')
  })

  it('names a half-loaded comparison by the side it has', () => {
    expect(tabTitle({ left: file('only.txt') })).toBe('only.txt')
    expect(tabTitle({ right: file('other.txt') })).toBe('other.txt')
  })

  it('reads a partial paste through its dropped file', () => {
    expect(tabTitle({ mode: 'paste', pasteLeftFile: file('dropped.md') })).toBe('dropped.md')
  })

  it('calls a paste with text what it is', () => {
    expect(tabTitle({ mode: 'paste', pasteLeft: 'hello' })).toBe('Pasted text')
  })

  it('is never blank while a tab is still being filled in', () => {
    expect(tabTitle({})).toBe('Untitled')
    expect(tabTitle(undefined)).toBe('Untitled')
    expect(tabTitle({ mode: 'paste', pasteLeft: '', pasteRight: '' })).toBe('Untitled')
  })
})

describe('createTab', () => {
  it('titles itself from the snapshot and starts unsaved', () => {
    const tab = createTab({ left: file('a.txt'), right: file('b.txt') })
    expect(tab.title).toBe('a.txt ↔ b.txt')
    expect(tab.diffSaved).toBe(false)
  })

  it('gives every tab its own id', () => {
    const ids = [createTab().id, createTab().id, createTab().id]
    expect(new Set(ids).size).toBe(3)
  })
})

describe('canAddTab', () => {
  it('stops at the ceiling', () => {
    expect(canAddTab([])).toBe(true)
    expect(canAddTab(Array.from({ length: MAX_TABS - 1 }, () => createTab()))).toBe(true)
    expect(canAddTab(Array.from({ length: MAX_TABS }, () => createTab()))).toBe(false)
  })
})

describe('nextActiveId', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('leaves the active tab alone when another one closes', () => {
    expect(nextActiveId(tabs, 'a', 'b')).toBe('b')
  })

  it('moves right when the active tab closes', () => {
    expect(nextActiveId(tabs, 'b', 'b')).toBe('c')
  })

  it('falls back to the left when the last tab closes', () => {
    expect(nextActiveId(tabs, 'c', 'c')).toBe('b')
  })

  it('reports nothing left when the only tab closes', () => {
    expect(nextActiveId([{ id: 'a' }], 'a', 'a')).toBeNull()
  })
})

describe('tabForEntry', () => {
  it('finds an already-open saved diff so it is focused, not duplicated', () => {
    const tabs = [{ id: 'a', entryId: 'v1' }, { id: 'b' }]
    expect(tabForEntry(tabs, 'v1').id).toBe('a')
    expect(tabForEntry(tabs, 'v2')).toBeUndefined()
    expect(tabForEntry(tabs, null)).toBeUndefined()
  })
})

describe('isBlank', () => {
  it('is true only when there is nothing to lose', () => {
    expect(isBlank(createTab())).toBe(true)
    expect(isBlank({ snapshot: { mode: 'paste', pasteLeft: '', pasteRight: '' } })).toBe(true)
    expect(isBlank(undefined)).toBe(true)
  })

  it('is false once either side holds anything', () => {
    expect(isBlank({ snapshot: { left: file('a.txt') } })).toBe(false)
    expect(isBlank({ snapshot: { mode: 'paste', pasteRight: 'typed' } })).toBe(false)
    expect(isBlank({ snapshot: { pasteLeftFile: file('d.md') } })).toBe(false)
  })
})

// Comparing pasted text names both sides with the same placeholder, so three
// paste tabs all read "Left (pasted) ↔ Right (…" — identical and truncated.
describe('paste comparisons', () => {
  const pasted = (l, r) => ({
    mode: 'files',
    left: { path: null, name: 'Left (pasted)', content: l },
    right: { path: null, name: 'Right (pasted)', content: r }
  })

  it('names the tab after the first line of what was pasted', () => {
    expect(tabTitle(pasted('prod-left', 'prod-right'))).toBe('prod-left')
  })

  it('skips leading blank lines to find something to say', () => {
    expect(tabTitle(pasted('\n\n  hello world  \nmore', 'x'))).toBe('hello world')
  })

  it('falls back to the other side when the left is empty', () => {
    expect(tabTitle(pasted('   ', 'right-only'))).toBe('right-only')
  })

  it('says what it is when both sides are blank', () => {
    expect(tabTitle(pasted('', ''))).toBe('Pasted text')
  })

  // Pretty-printed JSON opens on "[" or "{", so the first NON-EMPTY line is
  // punctuation and the tab was literally titled "[".
  it('skips structural punctuation to find a line that says something', () => {
    const json = '[\n  {\n    "id": 1,\n    "name": "Daniel Brown",'
    expect(tabTitle(pasted(json, 'x'))).toBe('"id": 1,')
  })

  it('skips a YAML document marker too', () => {
    expect(tabTitle(pasted('---\n\nname: web\n', 'x'))).toBe('name: web')
  })

  it('says "Pasted text" when there is nothing but punctuation', () => {
    expect(tabTitle(pasted('[\n]\n', '{}'))).toBe('Pasted text')
  })

  it('truncates a long first line rather than letting it fill the bar', () => {
    const title = tabTitle(pasted('x'.repeat(80), ''))
    expect(title).toHaveLength(24)
    expect(title.endsWith('…')).toBe(true)
  })

  // A real file called "Left (pasted)" would be a path on disk; only the
  // placeholder, which has no path, is treated this way.
  it('leaves a real file with that name alone', () => {
    const snapshot = {
      left: { path: '/tmp/Left (pasted)', name: 'Left (pasted)', content: 'a' },
      right: { path: '/tmp/Right (pasted)', name: 'Right (pasted)', content: 'b' }
    }
    expect(tabTitle(snapshot)).toBe('Left (pasted) ↔ Right (pasted)')
  })
})

describe('renaming', () => {
  it('shows a typed name over the derived one', () => {
    const tab = createTab({ left: file('a.txt'), right: file('b.txt') })
    expect(tabLabel(tab)).toBe('a.txt ↔ b.txt')
    tab.customTitle = 'prod vs staging'
    expect(tabLabel(tab)).toBe('prod vs staging')
  })

  it('falls back to the derived name once the typed one is cleared', () => {
    const tab = createTab({ left: file('a.txt'), right: file('b.txt') })
    tab.customTitle = ''
    expect(tabLabel(tab)).toBe('a.txt ↔ b.txt')
  })

  it('never shows nothing', () => {
    expect(tabLabel(undefined)).toBe('Untitled')
    expect(tabLabel({})).toBe('Untitled')
  })

  it('tidies a typed name and caps it', () => {
    expect(cleanTabName('  prod   vs  staging ')).toBe('prod vs staging')
    expect(cleanTabName('x'.repeat(200))).toHaveLength(MAX_TAB_NAME)
    expect(cleanTabName('   ')).toBe('')
    expect(cleanTabName(undefined)).toBe('')
  })
})

// The ceiling was a plain count standing in for a memory bound — every tab
// holds both sides in full. A streamed side holds nothing (it is a path the
// viewer reads windows from), so the count charged the cheapest tabs the same
// rent as a pair of 200 MB files.
describe('what a tab costs', () => {
  const withSnapshot = (snapshot) => ({ id: 'x', snapshot })
  const text = (n) => 'x'.repeat(n)

  it('counts both sides of a file comparison', () => {
    expect(
      tabCost(withSnapshot({ left: { content: text(100) }, right: { content: text(50) } }))
    ).toBe(150)
  })

  it('counts pasted text and pasted files', () => {
    expect(tabCost(withSnapshot({ pasteLeft: text(30), pasteRight: text(20) }))).toBe(50)
    expect(tabCost(withSnapshot({ pasteLeftFile: { content: text(40) } }))).toBe(40)
  })

  it('charges a streamed side nothing at all', () => {
    const streamed = { kind: 'streamed', path: '/tmp/huge.log', name: 'huge.log', size: 9e9 }
    expect(tabCost(withSnapshot({ left: streamed, right: streamed }))).toBe(0)
  })

  it('counts a spreadsheet by its cells', () => {
    const sheets = [{ name: 'S', rows: [[1, 2, 3], [4, 5, 6]] }]
    expect(tabCost(withSnapshot({ left: { kind: 'spreadsheet', sheets } }))).toBe(6)
  })

  it('is zero for a blank or malformed tab', () => {
    expect(tabCost(withSnapshot({}))).toBe(0)
    expect(tabCost(undefined)).toBe(0)
  })
})

describe('canAddTab — budget as well as count', () => {
  const costing = (chars) => ({ id: 'c', snapshot: { left: { content: 'x'.repeat(chars) } } })
  const streamed = () => ({
    id: 's',
    snapshot: { left: { kind: 'streamed', path: '/a' }, right: { kind: 'streamed', path: '/b' } }
  })

  it('allows well past the old six when the tabs are small', () => {
    expect(MAX_TABS).toBeGreaterThan(6)
    expect(canAddTab(Array.from({ length: 7 }, () => costing(1000)))).toBe(true)
  })

  it('refuses once the open comparisons hold about as much as one window can', () => {
    expect(canAddTab([costing(MAX_LIVE_CHARS + 1)])).toBe(false)
  })

  it('never charges streamed comparisons against the budget', () => {
    const many = Array.from({ length: MAX_TABS - 1 }, streamed)
    expect(tabsCost(many)).toBe(0)
    expect(canAddTab(many)).toBe(true)
  })

  it('still stops at the count rail, so the strip stays navigable', () => {
    expect(canAddTab(Array.from({ length: MAX_TABS }, streamed))).toBe(false)
  })
})

describe('tabsFullNotice', () => {
  const costing = (chars) => ({ id: 'c', snapshot: { left: { content: 'x'.repeat(chars) } } })

  it('names the count when the rail is what stopped it', () => {
    expect(tabsFullNotice(Array.from({ length: MAX_TABS }, () => costing(1)))).toContain(
      String(MAX_TABS)
    )
  })

  // The user-visible fact, not the constant behind it.
  it('says what is actually full when the budget is what stopped it', () => {
    const notice = tabsFullNotice([costing(MAX_LIVE_CHARS + 1)])
    expect(notice).toMatch(/as much text as one window can/)
    expect(notice).not.toContain(String(MAX_TABS))
  })
})
