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
    await store.runCliCommand({ name: 'compare', files: ['/work/a.json'] })
    expect(store.left?.name).toBe('a.json')
    expect(store.right).toBeNull()
  })

  it('loads two files as the two sides', async () => {
    const store = useDiffStore()
    withTabs()
    await store.runCliCommand({ name: 'compare', files: ['/work/a.json', '/work/b.json'] })
    expect([store.left?.name, store.right?.name]).toEqual(['a.json', 'b.json'])
    expect(store.ready).toBe(true)
  })

  // A comparison already on screen is not something the CLI may overwrite.
  it('opens a new tab rather than replacing the comparison in the current one', async () => {
    const store = useDiffStore()
    const tabs = withTabs()
    await store.runCliCommand({ name: 'compare', files: ['/work/a.json', '/work/b.json'] })
    expect(tabs.tabs).toHaveLength(1)

    await store.runCliCommand({ name: 'compare', files: ['/work/c.json'] })
    expect(tabs.tabs).toHaveLength(2)
    expect(store.left?.name).toBe('c.json')
  })

  it('refuses with a named dialog when every tab is in use', async () => {
    const store = useDiffStore()
    const tabs = withTabs()
    // Fill every tab, so none of them is blank and no more can be added.
    for (let i = 0; i < MAX_TABS; i++) {
      if (i) tabs.newTab({ paste: false })
      await store.runCliCommand({ name: 'compare', files: [`/work/f${i}.json`] })
    }
    expect(tabs.tabs).toHaveLength(MAX_TABS)
    expect(tabs.canAdd).toBe(false)

    await store.runCliCommand({ name: 'compare', files: ['/work/x.json', '/work/y.json'] })
    expect(tabs.tabs).toHaveLength(MAX_TABS)
    expect(store.cliBlocked).toContain('x.json and y.json')
    expect(store.cliBlocked).toContain(String(MAX_TABS))
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
      store.runCliCommand({ name: 'compare', files: ['/work/dir'] })
    ).resolves.toBeUndefined()
    expect(store.left).toBeNull()
    expect(store.notice).toBeTruthy()
  })

  it('does not load a binary file into a side', async () => {
    window.api.readFile = async (p) => ({ error: 'binary', name: String(p).split('/').pop() })
    const store = useDiffStore()
    withTabs()
    await store.runCliCommand({ name: 'compare', files: ['/work/logo.png'] })
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
    await store.runCliCommand({ name: 'compare', files: ['/work/a.json', '/work/b.json'] })
    expect(store.left?.name).toBe('a.json')
    expect(store.right).toBeNull()
    expect(store.ready).toBe(false)
  })
})

describe('runCliCommand — snippets', () => {
  it('create snippet opens an empty editor', async () => {
    const store = useDiffStore()
    withTabs()
    await store.runCliCommand({ name: 'create-snippet' })
    expect(useSnippetStore().editingSnippet).toMatchObject({ id: null, initialContent: '' })
  })

  it('cb save stores the clipboard under a timestamped name and opens it', async () => {
    const store = useDiffStore()
    const snippets = useSnippetStore()
    await store.runCliCommand({ name: 'clipboard-save', text: '{"a":1}' })

    const entry = snippets.entries.at(0)
    expect(entry.name).toMatch(/^Clipboard - \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(entry.language).toBe('json') // autodetected, not left as plaintext
    expect(snippets.editingSnippet).toEqual({ id: entry.id })
  })

  // Saving an empty snippet would be a silent no-op the user cannot explain.
  it('cb save says so rather than saving nothing', async () => {
    const store = useDiffStore()
    await store.runCliCommand({ name: 'clipboard-save', text: '   ' })
    expect(useSnippetStore().entries).toHaveLength(0)
    expect(store.notice).toMatch(/clipboard is empty/i)
  })
})
