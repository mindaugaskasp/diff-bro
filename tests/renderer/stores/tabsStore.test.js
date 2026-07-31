// The tab store's whole job is that the diffStore keeps being THE ACTIVE
// DOCUMENT: switching folds the live comparison back into its tab and unfolds
// the next one, so nothing is ever held in two places at once.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import { MAX_TABS, tabLabel } from '../../../src/renderer/src/utils/tabs'

const FILE = (name, content = 'x') => ({ path: `/tmp/${name}`, name, content })
const comparison = (l, r) => ({ mode: 'files', left: FILE(l), right: FILE(r) })

// init() adopts the (blank) current document as tab one, and the first open()
// reuses it — so N comparisons means N tabs, not N+1.
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

describe('init', () => {
  it('adopts whatever is already on screen as the first tab', () => {
    const diff = useDiffStore()
    diff.left = FILE('a.txt')
    diff.right = FILE('b.txt')
    const tabs = useTabsStore()
    tabs.init()
    expect(tabs.tabs).toHaveLength(1)
    expect(tabs.active.title).toBe('a.txt ↔ b.txt')
    // A comparison must not be pushed behind a blank tab on startup.
    expect(diff.left.name).toBe('a.txt')
  })

  it('is idempotent, so a re-render cannot stack first tabs', () => {
    const tabs = useTabsStore()
    tabs.init()
    tabs.init()
    expect(tabs.tabs).toHaveLength(1)
  })

  // The bar carries the "+", so hiding it at one tab would leave no way to make
  // a second — it is shown from the first document on.
  it('shows the bar as soon as there is a document', () => {
    const tabs = useTabsStore()
    expect(tabs.visible).toBe(false)
    tabs.init()
    expect(tabs.visible).toBe(true)
  })
})

describe('switching', () => {
  it('carries each tab its own comparison', () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('a.txt', 'b.txt'), comparison('one.json', 'two.json'))
    const [first, second] = tabs.tabs.map((t) => t.id)

    tabs.activate(first)
    expect(diff.left.name).toBe('a.txt')
    tabs.activate(second)
    expect(diff.left.name).toBe('one.json')
    expect(diff.right.name).toBe('two.json')
  })

  it('keeps an edit made in a tab you switch away from', () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('a.txt', 'b.txt'), comparison('one.json', 'two.json'))
    const [first, second] = tabs.tabs.map((t) => t.id)

    // Type into the second tab, then look away and back.
    diff.mode = 'paste'
    diff.pasteLeft = 'typed here'
    tabs.activate(first)
    expect(diff.pasteLeft).toBe('')
    tabs.activate(second)
    expect(diff.pasteLeft).toBe('typed here')
  })

  it('restores each tab’s own saved state, not the saved-diff default', () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('scratch.txt', 'scratch2.txt'))
    const scratch = tabs.activeId
    // restore() means "opened from the vault" and sets diffSaved; a scratch tab
    // must not inherit that or it would silently skip the unsaved-work warning.
    tabs.open(comparison('saved.json', 'saved2.json'), { diffSaved: true })
    expect(diff.diffSaved).toBe(true)
    tabs.activate(scratch)
    expect(diff.diffSaved).toBe(false)
  })

  it('ignores a switch to the tab already showing, or to one that is gone', () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('one.json', 'two.json'))
    tabs.activate(tabs.activeId)
    tabs.activate('no-such-tab')
    expect(diff.left.name).toBe('one.json')
  })

  it('steps through the tabs and wraps at both ends', () => {
    const tabs = withTabs(
      comparison('a.txt', 'a2.txt'),
      comparison('b.txt', 'b2.txt'),
      comparison('c.txt', 'c2.txt')
    )
    const [a, b, c] = tabs.tabs.map((t) => t.id)

    expect(tabs.activeId).toBe(c)
    tabs.step(1)
    expect(tabs.activeId).toBe(a)
    tabs.step(-1)
    expect(tabs.activeId).toBe(c)
    tabs.step(-1)
    expect(tabs.activeId).toBe(b)
  })
})

describe('opening', () => {
  it('reuses a blank tab rather than leaving an empty one behind', () => {
    const tabs = useTabsStore()
    tabs.init()
    tabs.open(comparison('a.txt', 'b.txt'))
    expect(tabs.tabs).toHaveLength(1)
    expect(tabs.active.title).toBe('a.txt ↔ b.txt')
  })

  // Reusing a blank tab is right when a comparison is being OPENED — it stops an
  // empty tab being left behind. It is wrong for the + button, where it made the
  // click do nothing at all on a fresh window.
  it('always makes a tab when asked for a new one, even from a blank one', () => {
    const tabs = useTabsStore()
    tabs.init()
    expect(tabs.tabs).toHaveLength(1)
    tabs.newTab()
    expect(tabs.tabs).toHaveLength(2)
    tabs.newTab()
    expect(tabs.tabs).toHaveLength(3)
  })

  it('still refuses a new tab past the ceiling', () => {
    const tabs = useTabsStore()
    tabs.init()
    for (let i = 0; i < MAX_TABS + 2; i++) tabs.newTab()
    expect(tabs.tabs).toHaveLength(MAX_TABS)
  })

  it('focuses a saved diff that is already open instead of duplicating it', () => {
    const tabs = useTabsStore()
    tabs.init()
    const id = tabs.open(comparison('v.json', 'v2.json'), { entryId: 'vault-1' })
    tabs.open(comparison('other.json', 'other2.json'))
    expect(tabs.tabs).toHaveLength(2)

    const again = tabs.open(comparison('v.json', 'v2.json'), { entryId: 'vault-1' })
    expect(again).toBe(id)
    expect(tabs.tabs).toHaveLength(2)
    expect(tabs.activeId).toBe(id)
  })

  it('refuses past the ceiling, and says so rather than failing silently', () => {
    const diff = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    for (let i = 0; i < MAX_TABS + 3; i++) tabs.open(comparison(`a${i}.txt`, `b${i}.txt`))
    expect(tabs.tabs).toHaveLength(MAX_TABS)
    expect(diff.notice).toContain('most tabs')
  })

  it('gives a new tab the view toggles already in use', () => {
    const diff = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    diff.renderSideBySide = false
    tabs.open(comparison('a.txt', 'b.txt'))
    expect(diff.renderSideBySide).toBe(false) // opening must not reset it either
    tabs.newTab()
    // A new tab must not silently undo the inline-view choice.
    expect(diff.renderSideBySide).toBe(false)
  })
})

describe('closing', () => {
  it('moves to the tab on the right, then falls back to the left', () => {
    const tabs = withTabs(
      comparison('a.txt', 'a2.txt'),
      comparison('b.txt', 'b2.txt'),
      comparison('c.txt', 'c2.txt')
    )
    const [a, b, c] = tabs.tabs.map((t) => t.id)

    tabs.activate(b)
    tabs.close(b)
    expect(tabs.activeId).toBe(c)
    tabs.close(c)
    expect(tabs.activeId).toBe(a)
  })

  it('leaves the tab you are looking at alone when another one closes', () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('a.txt', 'a2.txt'), comparison('b.txt', 'b2.txt'))
    const [a, b] = tabs.tabs.map((t) => t.id)
    tabs.close(a)
    expect(tabs.activeId).toBe(b)
    expect(diff.left.name).toBe('b.txt')
  })

  it('empties the last tab instead of leaving no comparison at all', () => {
    const diff = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    tabs.open(comparison('a.txt', 'b.txt'))
    tabs.close(tabs.activeId)
    expect(tabs.tabs).toHaveLength(1)
    expect(tabs.active.title).toBe('Untitled')
    expect(diff.left).toBeNull()
    expect(diff.right).toBeNull()
  })

  it('does not resurrect a closed tab’s state into its neighbour', () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('keep.txt', 'keep2.txt'))
    const keep = tabs.activeId
    tabs.open(comparison('drop.txt', 'drop2.txt'))
    tabs.close(tabs.activeId)
    expect(tabs.activeId).toBe(keep)
    expect(diff.left.name).toBe('keep.txt')
  })
})

describe('titles', () => {
  it('follows the live document without waiting for a switch', () => {
    const diff = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    expect(tabs.active.title).toBe('Untitled')
    diff.left = FILE('picked.json')
    tabs.syncActiveTitle()
    expect(tabs.active.title).toBe('picked.json')
  })
})

describe('renaming', () => {
  it('keeps a typed name while the derived one follows the files underneath', () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    tabs.rename(tabs.activeId, 'prod vs staging')
    expect(tabLabel(tabs.active)).toBe('prod vs staging')

    // Loading different files must not silently take the name back.
    diff.left = FILE('other.json')
    tabs.syncActiveTitle()
    expect(tabLabel(tabs.active)).toBe('prod vs staging')
    expect(tabs.active.title).toBe('other.json ↔ b.txt')
  })

  it('returns to naming itself when the name is cleared', () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    tabs.rename(tabs.activeId, 'temporary')
    tabs.rename(tabs.activeId, '   ')
    expect(tabLabel(tabs.active)).toBe('a.txt ↔ b.txt')
  })

  it('survives switching away and back', () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'), comparison('c.txt', 'd.txt'))
    const [first, second] = tabs.tabs.map((t) => t.id)
    tabs.rename(first, 'the important one')

    tabs.activate(second)
    tabs.activate(first)
    expect(tabLabel(tabs.active)).toBe('the important one')
  })

  it('renames only the tab asked for, and ignores one that is gone', () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'), comparison('c.txt', 'd.txt'))
    const [first, second] = tabs.tabs.map((t) => t.id)
    tabs.rename(first, 'mine')
    expect(tabLabel(tabs.tabs.find((t) => t.id === second))).toBe('c.txt ↔ d.txt')
    tabs.rename('no-such-tab', 'nowhere')
  })
})

describe('a tab holding a saved diff', () => {
  it('opens under the name the diff was saved with', () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    tabs.open(comparison('cfg.json', 'cfg2.json'), {
      diffSaved: true,
      entryId: 'vault-1',
      name: 'Nightly config'
    })
    expect(tabLabel(tabs.active)).toBe('Nightly config')
  })

  it('renames the saved diff when the tab is renamed, so they cannot drift', async () => {
    const vault = useVaultStore()
    window.api = {
      vaultEncrypt: async (plaintext) => ({ iv: 'iv', data: plaintext }),
      vaultDecrypt: async (box) => box.data,
      storeSave: () => {}
    }
    const id = await vault.save('Original name', null, { mode: 'files' })

    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    tabs.open(comparison('a.txt', 'b.txt'), { diffSaved: true, entryId: id, name: 'Original name' })
    tabs.rename(tabs.activeId, 'Renamed in the tab')

    expect(vault.entries.find((e) => e.id === id).name).toBe('Renamed in the tab')
  })

  it('leaves the vault alone for a tab that was never saved', () => {
    const vault = useVaultStore()
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    tabs.rename(tabs.activeId, 'just a tab')
    expect(vault.entries).toHaveLength(0)
  })
})
