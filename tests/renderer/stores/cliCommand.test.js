// What the renderer does with a `diffbro …` launch main forwarded. The parsing
// is covered in tests/main/cli.test.js; this is the acting-on-it half.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultEncrypt, vaultDecrypt } from '../../../src/main/vaultCrypt'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import { MAX_TABS } from '../../../src/renderer/src/utils/tabs'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { useConfigBackupStore } from '../../../src/renderer/src/features/configBackup'
import { runCliCommand } from '../../../src/renderer/src/utils/commands'

// Dispatch left the store for the command registry; what these assert is still
// the effect a `diffbro …` launch has on real stores.
const cli = (command) =>
  runCliCommand(command, {
    diff: useDiffStore(),
    tabs: useTabsStore(),
    settings: useSettingsStore(),
    snippets: useSnippetStore(),
    configBackup: useConfigBackupStore()
  })

const KEY = randomBytes(32)
const FILE = (name) => ({ path: `/work/${name}`, name, content: `{"of":"${name}"}` })

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    readFile: async (path) => FILE(String(path).split('/').pop()),
    vaultEncrypt: async (p, aad) => vaultEncrypt(KEY, p, aad),
    vaultDecrypt: async (b, aad) => vaultDecrypt(KEY, b, aad)
  }
})

// The app always has a tab; the store only grows one when init() runs, so the
// unit setup does what App.vue does on mount.
const withTabs = () => {
  const tabs = useTabsStore()
  tabs.init()
  return tabs
}

describe('runCliCommand — compare', () => {
  it('loads one file into the left side of the empty tab it starts in', async () => {
    const store = useDiffStore()
    withTabs()
    await cli({ name: 'compare', files: ['/work/a.json'] })
    expect(store.left?.name).toBe('a.json')
    expect(store.right).toBeNull()
  })

  it('loads two files as the two sides', async () => {
    const store = useDiffStore()
    withTabs()
    await cli({ name: 'compare', files: ['/work/a.json', '/work/b.json'] })
    expect([store.left?.name, store.right?.name]).toEqual(['a.json', 'b.json'])
    expect(store.ready).toBe(true)
  })

  // A comparison already on screen is not something the CLI may overwrite.
  it('opens a new tab rather than replacing the comparison in the current one', async () => {
    const store = useDiffStore()
    const tabs = withTabs()
    await cli({ name: 'compare', files: ['/work/a.json', '/work/b.json'] })
    expect(tabs.tabs).toHaveLength(1)

    await cli({ name: 'compare', files: ['/work/c.json'] })
    expect(tabs.tabs).toHaveLength(2)
    expect(store.left?.name).toBe('c.json')
  })

  it('refuses with a named dialog when every tab is in use', async () => {
    const store = useDiffStore()
    const tabs = withTabs()
    // Fill every tab, so none of them is blank and no more can be added.
    for (let i = 0; i < MAX_TABS; i++) {
      if (i) tabs.newTab({ paste: false })
      await cli({ name: 'compare', files: [`/work/f${i}.json`] })
    }
    expect(tabs.tabs).toHaveLength(MAX_TABS)
    expect(tabs.canAdd).toBe(false)

    await cli({ name: 'compare', files: ['/work/x.json', '/work/y.json'] })
    expect(tabs.tabs).toHaveLength(MAX_TABS)
    expect(store.cliBlocked).toContain('x.json and y.json')
    expect(store.cliBlocked).toContain(String(MAX_TABS))
  })
})

// `git mergetool` walks the WHOLE conflict list, calling the tool once per file
// and moving on the instant it returns — which, behind the single-instance
// lock, is immediately. A merge with more conflicts than there are tabs
// therefore lands here N times in a row with nobody reading the answer.
describe('runCliCommand — a git merge with more conflicts than tabs', () => {
  // What the difftool launcher passes: its own copies of git's temp files.
  const conflict = (name) => [
    `/tmp/diffbro-git-aB3/before/${name}`,
    `/tmp/diffbro-git-aB3/after/${name}`
  ]
  const openConflict = (store, name) =>
    cli({ name: 'compare', files: conflict(name), transient: true })

  // Read from the snapshots, not the titles: the ACTIVE tab's snapshot is stale
  // by design, so its title still says "Untitled" while it holds a comparison.
  const holds = (tabs, name) =>
    tabs.tabs.some((t) => t.snapshot?.left?.name === name) || useDiffStore().left?.name === name

  // No manual newTab: a launch that finds a comparison on screen opens its own
  // tab, which is exactly the path git drives.
  const fillWith = async (store, open) => {
    for (let i = 0; i < MAX_TABS; i++) await open(store, `f${i}.txt`)
  }

  it('names every conflict it could not open, not just the last one', async () => {
    const store = useDiffStore()
    const tabs = withTabs()
    // Six tabs of the reader's OWN work — nothing here is safe to recycle.
    await fillWith(store, (s, n) => cli({ name: 'compare', files: [`/work/${n}`] }))
    expect(tabs.canAdd).toBe(false)

    for (const name of ['f7.txt', 'f8.txt', 'f9.txt']) await openConflict(store, name)

    // Each launch overwrote the dialog the one before it raised, so f7 and f8
    // were dropped without ever being mentioned.
    expect(store.cliBlocked).toContain('f7.txt')
    expect(store.cliBlocked).toContain('f8.txt')
    expect(store.cliBlocked).toContain('f9.txt')
  })

  // A comparison git handed us is throwaway by construction: both sides are
  // copies in a temp directory git has already deleted. Refusing the seventh
  // conflict to protect the first one is backwards.
  it('recycles the oldest throwaway git comparison instead of refusing', async () => {
    const store = useDiffStore()
    const tabs = withTabs()
    await fillWith(store, openConflict)
    expect(tabs.tabs).toHaveLength(MAX_TABS)

    await openConflict(store, 'f7.txt')

    expect(store.cliBlocked).toBeNull()
    expect(tabs.tabs).toHaveLength(MAX_TABS)
    expect(store.left?.name).toBe('f7.txt')
    // The oldest conflict made way; the ones after it are untouched.
    expect(holds(tabs, 'f0.txt')).toBe(false)
    expect(holds(tabs, 'f4.txt')).toBe(true)
  })

  // The reader's own comparisons are not the launcher's to reclaim.
  it('never recycles a tab the reader opened themselves', async () => {
    const store = useDiffStore()
    const tabs = withTabs()
    await fillWith(store, (s, n) => cli({ name: 'compare', files: [`/work/${n}`] }))

    await openConflict(store, 'f7.txt')

    expect(holds(tabs, 'f0.txt')).toBe(true)
    expect(store.cliBlocked).toContain('f7.txt')
  })
})

// A path typed in a shell is not a file the app chose: it can be a directory, a
// binary, a dead symlink, or gone by the time it is read. None of those may take
// the command down silently.
describe('runCliCommand — hostile paths', () => {
  it('survives a path the reader rejects outright, and says why', async () => {
    window.api.readFile = async () => {
      throw new Error("EISDIR: illegal operation on a directory, read '/work/dir'")
    }
    const store = useDiffStore()
    withTabs()
    await expect(
      cli({ name: 'compare', files: ['/work/dir'] })
    ).resolves.toBeUndefined()
    expect(store.left).toBeNull()
    expect(store.notice).toBeTruthy()
  })

  it('does not load a binary file into a side', async () => {
    window.api.readFile = async (p) => ({ error: 'binary', name: String(p).split('/').pop() })
    const store = useDiffStore()
    withTabs()
    await cli({ name: 'compare', files: ['/work/logo.png'] })
    expect(store.left).toBeNull()
    expect(store.notice).toMatch(/binary/i)
  })

  // Refused paths already return a shape rather than throwing; the command must
  // still not leave a half-loaded comparison behind.
  it('loads neither side when the second file is refused', async () => {
    window.api.readFile = async (p) =>
      String(p).endsWith('b.json')
        ? { error: 'not-permitted' }
        : { path: p, name: 'a.json', content: '{}' }
    const store = useDiffStore()
    withTabs()
    await cli({ name: 'compare', files: ['/work/a.json', '/work/b.json'] })
    expect(store.left?.name).toBe('a.json')
    expect(store.right).toBeNull()
    expect(store.ready).toBe(false)
  })
})

describe('runCliCommand — snippets', () => {
  it('create snippet opens an empty editor', async () => {
    withTabs()
    await cli({ name: 'create-snippet' })
    expect(useSnippetStore().editingSnippet).toMatchObject({ id: null, initialContent: '' })
  })

  it('cb save stores the clipboard under a timestamped name and opens it', async () => {
    const snippets = useSnippetStore()
    await cli({ name: 'clipboard-save', text: '{"a":1}' })

    const entry = snippets.entries.at(0)
    expect(entry.name).toMatch(/^Clipboard - \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(entry.language).toBe('json') // autodetected, not left as plaintext
    expect(snippets.editingSnippet).toEqual({ id: entry.id })
  })

  // Saving an empty snippet would be a silent no-op the user cannot explain.
  it('cb save says so rather than saving nothing', async () => {
    const store = useDiffStore()
    await cli({ name: 'clipboard-save', text: '   ' })
    expect(useSnippetStore().entries).toHaveLength(0)
    expect(store.notice).toMatch(/clipboard is empty/i)
  })
})
