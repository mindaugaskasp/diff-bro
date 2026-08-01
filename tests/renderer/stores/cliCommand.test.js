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
