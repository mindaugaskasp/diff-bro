// The tab store's whole job is that the diffStore keeps being THE ACTIVE
// DOCUMENT: switching folds the live comparison back into its tab and unfolds
// the next one, so nothing is ever held in two places at once.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { MAX_TABS, tabLabel } from '../../../src/renderer/src/utils/tabs'

const SESSION_KEY = randomBytes(32)
const FILE = (name, content = 'x') => ({ path: `/tmp/${name}`, name, content })
const comparison = (l, r) => ({ mode: 'files', left: FILE(l), right: FILE(r) })

// init() adopts the (blank) current document as tab one, and the first open()
// reuses it — so N comparisons means N tabs, not N+1.
function withTabs(...comparisons) {
  const tabs = useTabsStore()
  tabs.init()
  // A booted app has already read the stored session back (App.vue awaits
  // restoreSession on mount); saveSession refuses to write before that.
  tabs.sessionReady = true
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
    expect(diff.notice).toContain('most comparisons')
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

// Session persistence. The mocked window.api routes through the REAL vault
// crypto, so what lands in storage is genuinely sealed and a tampered file
// genuinely fails to open — the two things this feature turns on.
describe('the session, across a quit', () => {
  const stored = () => localStorage.getItem('diffbro.session')

  beforeEach(() => {
    window.api = {
      vaultEncrypt: async (plaintext, aad) => vaultEncrypt(SESSION_KEY, plaintext, aad),
      vaultDecrypt: async (box, aad) => vaultDecrypt(SESSION_KEY, box, aad)
    }
  })
  afterEach(() => {
    delete window.api
  })

  // A fresh app against the same storage: what the next launch sees.
  const relaunch = () => {
    setActivePinia(createPinia())
    const tabs = useTabsStore()
    tabs.init()
    return tabs
  }

  // The debounced save races the restore on launch: a file dropped inside the
  // 500ms window, before restoreSession() has read storage, used to overwrite
  // the stored session with the one tab that had just been opened — the rest
  // were gone. Only the EMPTY branch consulted sessionReady.
  it('does not overwrite a session that has not been read back yet', async () => {
    const first = withTabs(comparison('a.txt', 'b.txt'), comparison('c.txt', 'd.txt'))
    await first.saveSession()
    const sealed = stored()

    // A fresh launch where the user drops a file before restoreSession resolves.
    setActivePinia(createPinia())
    const tabs = useTabsStore()
    tabs.init()
    useDiffStore().left = FILE('dropped.txt')
    await tabs.saveSession()

    expect(stored()).toBe(sealed)

    // Once the restore has happened, saving is live again.
    await tabs.restoreSession()
    useDiffStore().left = FILE('later.txt')
    await tabs.saveSession()
    expect(stored()).not.toBe(sealed)
  })

  it('reopens every comparison, on the tab that was in front', async () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'), comparison('c.txt', 'd.txt'))
    tabs.activate(tabs.tabs[0].id)
    await tabs.saveSession()

    const next = relaunch()
    await expect(next.restoreSession()).resolves.toBe(2)
    expect(next.tabs.map((t) => t.title)).toEqual(['a.txt ↔ b.txt', 'c.txt ↔ d.txt'])
    expect(next.active.title).toBe('a.txt ↔ b.txt')
    expect(useDiffStore().left.name).toBe('a.txt')
  })

  it('stores the file contents sealed, never in the clear', async () => {
    const tabs = withTabs({ mode: 'paste', pasteLeft: 'the-secret-text', pasteRight: '' })
    await tabs.saveSession()
    expect(stored()).not.toContain('the-secret-text')

    const next = relaunch()
    await next.restoreSession()
    expect(useDiffStore().pasteLeft).toBe('the-secret-text')
    expect(useDiffStore().mode).toBe('paste')
  })

  // The active tab's own snapshot is only refreshed on a switch, so saving it
  // would store the comparison as it was before the last edits.
  it('keeps the edits made since the last tab switch', async () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    diff.right = FILE('edited.txt')
    await tabs.saveSession()

    const next = relaunch()
    await next.restoreSession()
    expect(useDiffStore().right.name).toBe('edited.txt')
  })

  it('brings a tab back with its typed name and its saved-diff identity', async () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    tabs.open(comparison('cfg.json', 'cfg2.json'), { diffSaved: true, entryId: 'vault-7' })
    tabs.rename(tabs.activeId, 'prod vs staging')
    await tabs.saveSession()

    const next = relaunch()
    await next.restoreSession()
    expect(tabLabel(next.active)).toBe('prod vs staging')
    expect(next.active.entryId).toBe('vault-7')
    // Opening that saved diff again focuses the restored tab instead of stacking
    // a duplicate on top of it.
    expect(next.open(comparison('cfg.json', 'cfg2.json'), { entryId: 'vault-7' })).toBe(
      next.active.id
    )
    expect(next.tabs).toHaveLength(2)
  })

  it('opens clean when nothing was left open', async () => {
    const tabs = relaunch()
    await expect(tabs.restoreSession()).resolves.toBe(0)
    expect(tabs.tabs).toHaveLength(1)
    expect(tabs.active.title).toBe('Untitled')
  })

  it('forgets the session once the last comparison is closed', async () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    await tabs.saveSession()
    tabs.close(tabs.activeId)
    await tabs.saveSession()

    const next = relaunch()
    await expect(next.restoreSession()).resolves.toBe(0)
    expect(useDiffStore().left).toBeNull()
  })

  it('refuses a tampered session rather than restoring what it says', async () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    await tabs.saveSession()
    const box = JSON.parse(stored())
    const flipped = Buffer.from(box.data, 'base64')
    flipped[0] ^= 0xff
    localStorage.setItem(
      'diffbro.session',
      JSON.stringify({ ...box, data: flipped.toString('base64') })
    )

    const next = relaunch()
    await expect(next.restoreSession()).resolves.toBe(0)
    expect(useDiffStore().left).toBeNull()
  })

  it('refuses a session sealed for something other than a session', async () => {
    const snapshot = JSON.stringify({ version: 1, tabs: [] })
    const box = await vaultEncrypt(SESSION_KEY, snapshot, 'saved-diff')
    localStorage.setItem('diffbro.session', JSON.stringify(box))
    await expect(relaunch().restoreSession()).resolves.toBe(0)
  })

  // A locked keychain is temporary. Clearing the file there would throw away
  // comparisons that are still perfectly restorable on the next launch.
  it('keeps the stored session when the vault key cannot be unlocked', async () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    await tabs.saveSession()
    const sealed = stored()

    const next = relaunch()
    window.api.vaultDecrypt = async () => ({ error: 'vault-key-unavailable' })
    await expect(next.restoreSession()).resolves.toBe(0)
    // The empty window it left behind must not be written over the session.
    await next.saveSession()
    expect(stored()).toBe(sealed)
  })

  it('writes nothing at all when the key is unavailable', async () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    window.api.vaultEncrypt = async () => ({ error: 'vault-key-unavailable' })
    await tabs.saveSession()
    expect(stored()).toBeNull()
  })
})

// Settings → Storage → "Reopen the comparisons that were open when I quit".
describe('when reopening comparisons is turned off', () => {
  beforeEach(() => {
    window.api = {
      vaultEncrypt: async (plaintext, aad) => vaultEncrypt(SESSION_KEY, plaintext, aad),
      vaultDecrypt: async (box, aad) => vaultDecrypt(SESSION_KEY, box, aad)
    }
  })
  afterEach(() => {
    delete window.api
  })

  it('is on to begin with', () => {
    expect(useSettingsStore().restoreSession).toBe(true)
  })

  it('forgets the session already stored the moment it is turned off', async () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    await tabs.saveSession()
    expect(localStorage.getItem('diffbro.session')).toContain('"data"')

    tabs.setRestoreSession(false)
    expect(localStorage.getItem('diffbro.session')).not.toContain('"data"')
    expect(useSettingsStore().restoreSession).toBe(false)
  })

  it('stores nothing while it is off', async () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    tabs.setRestoreSession(false)
    tabs.open(comparison('c.txt', 'd.txt'))
    await tabs.saveSession()
    expect(localStorage.getItem('diffbro.session')).not.toContain('"data"')
  })

  // The choice outlives the quit — it is written to settings, not just held.
  it('opens on an empty comparison next launch', async () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    await tabs.saveSession()
    useSettingsStore().setRestoreSession(false)

    setActivePinia(createPinia())
    const next = useTabsStore()
    next.init()
    await expect(next.restoreSession()).resolves.toBe(0)
    expect(useDiffStore().left).toBeNull()
  })

  it('starts storing again once it is turned back on', async () => {
    const tabs = withTabs(comparison('a.txt', 'b.txt'))
    tabs.setRestoreSession(false)
    tabs.setRestoreSession(true)
    await tabs.saveSession()

    setActivePinia(createPinia())
    const next = useTabsStore()
    next.init()
    await expect(next.restoreSession()).resolves.toBe(1)
  })
})

// A tab's snapshot only refreshes on a switch, so asking it about the tab you
// are LOOKING at reads a stale copy — which is how the unsaved marker came out
// backwards and the close guard waved unsaved work through.
describe('the tab on screen, asked about itself', () => {
  it('is unsaved the moment work lands in it, without waiting for a switch', () => {
    const diff = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    expect(tabs.unsaved(tabs.active)).toBe(false) // blank: nothing to lose

    diff.left = FILE('a.txt')
    diff.right = FILE('b.txt')
    expect(tabs.unsaved(tabs.active)).toBe(true)
  })

  it('stops being unsaved as soon as it is saved, not on the next switch', () => {
    const diff = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    diff.left = FILE('a.txt')
    diff.right = FILE('b.txt')

    diff.markSaved()
    expect(tabs.unsaved(tabs.active)).toBe(false)
  })

  it('goes back to unsaved when a saved comparison is edited', () => {
    const diff = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    tabs.open(comparison('a.txt', 'b.txt'), { diffSaved: true })
    expect(tabs.unsaved(tabs.active)).toBe(false)

    diff.swap()
    expect(tabs.unsaved(tabs.active)).toBe(true)
  })

  it('still answers from the snapshot for a tab that is not on screen', () => {
    const tabs = withTabs(comparison('a.txt', 'a2.txt'))
    const first = tabs.activeId
    tabs.open(comparison('b.txt', 'b2.txt'), { diffSaved: true })

    expect(tabs.unsaved(tabs.tabs.find((t) => t.id === first))).toBe(true)
    expect(tabs.unsaved(tabs.active)).toBe(false)
  })
})

describe('requestClose', () => {
  it('asks before discarding the work in the tab on screen', () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('keep.txt', 'keep2.txt'))
    tabs.newTab()
    // Work done since the tab was made — its snapshot has not caught up.
    diff.left = FILE('precious.txt')
    diff.right = FILE('precious2.txt')

    tabs.requestClose(tabs.activeId)
    expect(tabs.pendingClose).toEqual([tabs.activeId])
    expect(tabs.tabs).toHaveLength(2)
  })

  it('closes a saved or empty tab without asking', () => {
    const tabs = withTabs(comparison('a.txt', 'a2.txt'))
    tabs.newTab()

    tabs.requestClose(tabs.activeId)
    expect(tabs.pendingClose).toBeNull()
    expect(tabs.tabs).toHaveLength(1)
  })

  it('asks about a background tab from its snapshot, and ignores one that is gone', () => {
    const tabs = withTabs(comparison('a.txt', 'a2.txt'))
    const first = tabs.activeId
    tabs.open(comparison('b.txt', 'b2.txt'), { diffSaved: true })

    tabs.requestClose(first)
    expect(tabs.pendingClose).toEqual([first])

    tabs.pendingClose = null
    tabs.requestClose('tab-gone')
    expect(tabs.pendingClose).toBeNull()
    expect(tabs.tabs).toHaveLength(2)
  })
})

// Bulk closes from the tab context menu. The trap they all share: the discard
// prompt used to name ONE comparison, so four unsaved tabs meant four dialogs.
describe('closing several tabs at once', () => {
  const saved = (tabs, l, r) => tabs.open(comparison(l, r), { diffSaved: true })

  // All four already in the vault, so the close path is exercised without the
  // discard prompt getting in the way — that has its own tests below.
  const fourSaved = () => {
    const tabs = withTabs()
    saved(tabs, 'a.txt', 'a2.txt')
    saved(tabs, 'b.txt', 'b2.txt')
    saved(tabs, 'c.txt', 'c2.txt')
    saved(tabs, 'd.txt', 'd2.txt')
    return tabs
  }

  it('closes to the right of the anchor, keeping the anchor', () => {
    const tabs = fourSaved()
    tabs.requestMenuAction(tabs.tabs[1].id, 'close-right')
    expect(tabs.tabs.map((t) => t.title)).toEqual(['a.txt ↔ a2.txt', 'b.txt ↔ b2.txt'])
  })

  it('closes to the left of the anchor, keeping the anchor', () => {
    const tabs = fourSaved()
    tabs.requestMenuAction(tabs.tabs[2].id, 'close-left')
    expect(tabs.tabs.map((t) => t.title)).toEqual(['c.txt ↔ c2.txt', 'd.txt ↔ d2.txt'])
  })

  it('closes every other tab, leaving the anchor active', () => {
    const tabs = fourSaved()
    const anchor = tabs.tabs[1].id
    tabs.requestMenuAction(anchor, 'close-others')
    expect(tabs.tabs).toHaveLength(1)
    expect(tabs.activeId).toBe(anchor)
  })

  // close() already refuses to leave an empty window; Close All rides on that
  // rather than inventing a second empty state.
  it('close-all leaves one blank comparison, not an empty window', () => {
    const tabs = fourSaved()
    tabs.requestMenuAction(tabs.tabs[0].id, 'close-all')
    expect(tabs.tabs).toHaveLength(1)
    expect(tabs.visible).toBe(true)
    expect(useDiffStore().left).toBeNull()
    expect(useDiffStore().right).toBeNull()
  })

  it('moves off a closed active tab onto a survivor', () => {
    const tabs = fourSaved()
    tabs.activate(tabs.tabs[3].id)
    tabs.requestMenuAction(tabs.tabs[1].id, 'close-right')
    expect(tabs.activeId).toBe(tabs.tabs[1].id)
    expect(tabs.tabs).toHaveLength(2)
  })

  it('asks ONCE for a bulk close, listing every unsaved tab it would take', () => {
    const tabs = withTabs(comparison('a.txt', 'a2.txt'))
    saved(tabs, 'saved.txt', 'saved2.txt')
    tabs.open(comparison('dirty1.txt', 'x.txt'))
    tabs.open(comparison('dirty2.txt', 'y.txt'))

    tabs.requestMenuAction(tabs.tabs[1].id, 'close-right')
    expect(tabs.pendingClose).toHaveLength(2)
    expect(tabs.tabs).toHaveLength(4)

    tabs.confirmClose()
    expect(tabs.pendingClose).toBeNull()
    expect(tabs.tabs).toHaveLength(2)
  })

  it('closes without asking when nothing in the set is unsaved', () => {
    const tabs = fourSaved()
    tabs.requestMenuAction(tabs.tabs[0].id, 'close-right')
    expect(tabs.pendingClose).toBeNull()
    expect(tabs.tabs).toHaveLength(1)
  })

  it('keeps every tab when the prompt is declined', () => {
    const tabs = withTabs(comparison('a.txt', 'a2.txt'))
    tabs.open(comparison('dirty.txt', 'x.txt'))
    tabs.requestMenuAction(tabs.tabs[0].id, 'close-all')
    expect(tabs.pendingClose).toBeTruthy()

    tabs.cancelClose()
    expect(tabs.pendingClose).toBeNull()
    expect(tabs.tabs).toHaveLength(2)
  })

  it('does nothing for an action that would close nothing', () => {
    const tabs = fourSaved()
    tabs.requestMenuAction(tabs.tabs[0].id, 'close-left')
    expect(tabs.tabs).toHaveLength(4)
    expect(tabs.pendingClose).toBeNull()
  })
})

describe('forgetEntry', () => {
  it('unlinks the tab holding a deleted diff and marks it unsaved again', () => {
    const diff = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    tabs.open(comparison('a.txt', 'b.txt'), { diffSaved: true, entryId: 'gone-1' })

    tabs.forgetEntry('gone-1')
    expect(tabs.active.entryId).toBeNull()
    expect(diff.diffSaved).toBe(false)
    expect(tabs.unsaved(tabs.active)).toBe(true)
  })

  it('leaves every other tab alone', () => {
    const tabs = useTabsStore()
    tabs.init()
    tabs.open(comparison('a.txt', 'b.txt'), { diffSaved: true, entryId: 'keep-1' })
    tabs.open(comparison('c.txt', 'd.txt'), { diffSaved: true, entryId: 'gone-1' })

    tabs.forgetEntry('gone-1')
    expect(tabs.tabs[0].entryId).toBe('keep-1')
    expect(tabs.tabs[0].diffSaved).toBe(true)
  })
})

// The view toggles sit together in the toolbar and read as properties of the
// comparison you are looking at. Split view and ignore-whitespace travel with
// their tab; structure view was global, so setting it in one tab silently
// changed the other.
describe('the structure toggle belongs to its comparison', () => {
  const json = (l, r) => ({
    mode: 'files',
    left: { path: '/tmp/l.json', name: 'l.json', content: l },
    right: { path: '/tmp/r.json', name: 'r.json', content: r }
  })

  it('stays with the tab it was set in', () => {
    const diff = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    tabs.open(json('{"a":1}', '{"a":2}'))
    const first = tabs.activeId
    diff.semanticView = true

    tabs.open(json('{"b":1}', '{"b":2}'))
    expect(diff.semanticView).toBe(false)

    tabs.activate(first)
    expect(diff.semanticView).toBe(true)
  })

  it('comes back with a restored session, like the other view toggles', async () => {
    window.api = {
      vaultEncrypt: async (text, aad) => vaultEncrypt(SESSION_KEY, text, aad),
      vaultDecrypt: async (box, aad) => vaultDecrypt(SESSION_KEY, box, aad)
    }
    const diff = useDiffStore()
    const tabs = useTabsStore()
    tabs.init()
    tabs.sessionReady = true // as a booted app is, after restoreSession
    tabs.open(json('{"a":1}', '{"a":2}'))
    diff.semanticView = true
    diff.renderSideBySide = false
    await tabs.saveSession()

    setActivePinia(createPinia())
    window.api = {
      vaultEncrypt: async (text, aad) => vaultEncrypt(SESSION_KEY, text, aad),
      vaultDecrypt: async (box, aad) => vaultDecrypt(SESSION_KEY, box, aad)
    }
    const next = useTabsStore()
    next.init()
    await next.restoreSession()
    expect(useDiffStore().semanticView).toBe(true)
    expect(useDiffStore().renderSideBySide).toBe(false)
    delete window.api
  })
})

// Sixteen tabs makes the session's byte budget bite routinely, and a comparison
// left out of the session is one that will not come back.
describe('comparisons too large to reopen', () => {
  beforeEach(() => {
    window.api = {
      vaultEncrypt: async (text, aad) => vaultEncrypt(SESSION_KEY, text, aad),
      vaultDecrypt: async (box, aad) => vaultDecrypt(SESSION_KEY, box, aad)
    }
  })
  afterEach(() => {
    delete window.api
  })

  const huge = () => ({ mode: 'files', left: FILE('huge.txt'), right: FILE('huge2.txt') })

  it('says so once, not on every debounced save', async () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('a.txt', 'a2.txt'))
    tabs.open(huge())
    // Bigger than the per-tab ceiling, so the session cannot carry it.
    diff.left = { path: '/tmp/huge.txt', name: 'huge.txt', content: 'x'.repeat(2_100_000) }

    await tabs.saveSession()
    expect(diff.notice).toMatch(/too large to reopen/)

    diff.notice = ''
    await tabs.saveSession()
    expect(diff.notice).toBe('')
  })

  it('says nothing while everything still fits', async () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('a.txt', 'a2.txt'))
    await tabs.saveSession()
    expect(diff.notice ?? '').not.toMatch(/too large to reopen/)
    expect(tabs.sessionDropped).toBe(0)
  })
})

// Clearing empties the comparison, but the tab went on claiming to BE the saved
// diff it no longer held — and open() focuses a tab already showing an entry
// rather than loading it, so the saved diff could not be opened again. Clearing
// spans both stores, so it lives on the tab store — the one allowed to read the
// core.
describe('clearing a tab opened from the vault', () => {
  it('lets the saved diff be opened again afterwards', () => {
    const diff = useDiffStore()
    const tabs = withTabs()
    tabs.open(comparison('saved.json', 'saved2.json'), { diffSaved: true, entryId: 'vault-1' })
    expect(tabs.active.entryId).toBe('vault-1')

    diff.clear()
    expect(tabs.active.entryId).toBe(null)

    tabs.open(comparison('saved.json', 'saved2.json'), { diffSaved: true, entryId: 'vault-1' })
    expect(diff.left.name).toBe('saved.json')
    expect(diff.right.name).toBe('saved2.json')
  })

  // Dropping files onto a SAVED comparison replaces it with no prompt — which
  // makes it the commonest way the link is orphaned, not the rarest. The unlink
  // has to ride with the clear itself, not with the one caller that remembers.
  it('unlinks when a replacement is dropped in, not just on an explicit clear', async () => {
    const diff = useDiffStore()
    const tabs = withTabs()
    tabs.open(comparison('saved.json', 'saved2.json'), { diffSaved: true, entryId: 'vault-1' })
    expect(tabs.active.entryId).toBe('vault-1')

    window.api = { readFile: async (path) => FILE(String(path).split('/').pop()) }
    diff.pendingReplace = ['/tmp/new-a.txt', '/tmp/new-b.txt']
    await diff.confirmReplace()

    expect(diff.left.name).toBe('new-a.txt')
    expect(tabs.active.entryId).toBe(null)
  })

  it('does not leave a hollow tab standing in for the entry', () => {
    const diff = useDiffStore()
    const tabs = withTabs()
    tabs.open(comparison('a.json', 'b.json'), { diffSaved: true, entryId: 'vault-7' })
    diff.clear()
    expect(tabs.tabs.filter((t) => t.entryId === 'vault-7')).toHaveLength(0)
  })

  it('leaves an unlinked tab alone', () => {
    const diff = useDiffStore()
    const tabs = withTabs(comparison('scratch.txt', 'scratch2.txt'))
    diff.clear()
    expect(tabs.active.entryId ?? null).toBe(null)
    expect(diff.left).toBeNull()
  })
})
