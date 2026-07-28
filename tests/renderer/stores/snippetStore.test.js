// Integration-style store tests: the mocked window.api routes through the REAL
// main-process crypto (vaultCrypt + snippetSealing), so the whole
// save/load/export/import/tamper/migrate path is exercised — only Electron IPC
// (file dialogs) is skipped.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import { createIdentityKeys } from '../../../src/main/sealing'
import { openSnippets, sealSnippets } from '../../../src/main/snippetSealing'
import {
  EXAMPLE_SNIPPET,
  MAX_TAGS,
  TAG_PALETTE,
  languageOf,
  useSnippetStore
} from '../../../src/renderer/src/stores/snippetStore'

const KEY = randomBytes(32)
const IDENTITY = createIdentityKeys()
let lastExportedFile = null

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  lastExportedFile = null
  window.api = {
    vaultEncrypt: async (plaintext, aad) => vaultEncrypt(KEY, plaintext, aad),
    vaultDecrypt: async (box, aad) => vaultDecrypt(KEY, box, aad),
    exportSnippets: async (bundle, passphrase) => {
      lastExportedFile = await sealSnippets(bundle, passphrase, IDENTITY)
      return { ok: true, path: '/tmp/fake.diffbrosnip' }
    },
    importSnippets: async (passphrase) => {
      if (!lastExportedFile) return { error: 'not-a-snippet-file' }
      return openSnippets(lastExportedFile, passphrase)
    }
  }
})

describe('snippetStore — first-run example', () => {
  it('seeds the Mermaid example through the normal encrypted add path', async () => {
    const store = useSnippetStore()
    const id = await store.seedExample()
    expect(id).toBeTruthy()
    expect(store.entries).toHaveLength(1)
    const [entry] = store.entries
    expect(entry.name).toBe(EXAMPLE_SNIPPET.name)
    expect(languageOf(entry)).toBe('mermaid')
    // stored encrypted, decrypts back to the example content
    const raw = localStorage.getItem('diffbro.snippets')
    expect(raw).not.toContain('flowchart')
    await expect(store.load(id)).resolves.toBe(EXAMPLE_SNIPPET.content)
  })

  it('reports null (and seeds nothing) when the vault key is unavailable', async () => {
    const store = useSnippetStore()
    window.api.vaultEncrypt = async () => ({ error: 'vault-key-unavailable' })
    const id = await store.seedExample()
    expect(id).toBeNull()
    expect(store.entries).toHaveLength(0)
  })
})

describe('snippetStore — effective language', () => {
  const DIAGRAM = 'flowchart TD\n  A --> B'

  it('records the detected language so an auto snippet still resolves', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'diagram', content: DIAGRAM, language: 'auto', tags: [] })
    expect(store.entries[0].language).toBe('auto')
    expect(languageOf(store.entries[0])).toBe('mermaid')
  })

  it('keeps an explicit choice over detection', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'as text', content: DIAGRAM, language: 'plaintext', tags: [] })
    expect(languageOf(store.entries[0])).toBe('plaintext')
  })

  it('re-detects when the content is edited', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'note', content: 'just a note', language: 'auto', tags: [] })
    expect(languageOf(store.entries[0])).toBe('plaintext')
    await store.update(id, { name: 'note', content: DIAGRAM, language: 'auto' })
    expect(languageOf(store.entries[0])).toBe('mermaid')
  })

  it('backfills detection for an older entry the first time it is decrypted', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'legacy', content: DIAGRAM, language: 'auto', tags: [] })
    delete store.entries[0].detected // as an entry saved by an older build reads
    expect(languageOf(store.entries[0])).toBe('plaintext')
    await store.load(id)
    expect(languageOf(store.entries[0])).toBe('mermaid')
  })

  it('falls back to plaintext for entries saved before detection was recorded', () => {
    expect(languageOf({ language: 'auto' })).toBe('plaintext')
    expect(languageOf({ language: 'json' })).toBe('json')
  })

  it('auto-tags a saved snippet with its detected format', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'cfg', content: '{"a": 1, "b": 2}', language: 'auto' })
    expect(store.entries.find((e) => e.id === id).tags).toContain('json')
  })

  it('auto-tags with the explicit language, alongside the user tags', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'q', content: 'SELECT 1', language: 'sql', tags: ['wip'] })
    expect(store.entries.find((e) => e.id === id).tags).toEqual(
      expect.arrayContaining(['sql', 'wip'])
    )
  })

  it('adds no format tag for a plaintext snippet', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'note', content: 'hello world', language: 'plaintext' })
    expect(store.entries.find((e) => e.id === id).tags).toHaveLength(0)
  })
})

describe('snippetStore — tags model', () => {
  it('starts empty (no categories; Default is the implicit catch-all)', () => {
    const store = useSnippetStore()
    expect(store.entries).toEqual([])
    expect(store.tags).toEqual({})
    expect(store.defaultCount).toBe(0)
  })

  it('adds a tagged snippet, encrypted at rest, and registers its tags', async () => {
    const store = useSnippetStore()
    const id = await store.add({
      name: 'find user',
      content: 'SELECT * FROM users',
      language: 'sql',
      tags: ['sql', 'postgres']
    })
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0].tags).toEqual(['sql', 'postgres'])
    expect(store.tags.sql).toBeTruthy()
    expect(store.tags.postgres).toBeTruthy()
    await expect(store.load(id)).resolves.toBe('SELECT * FROM users')

    const raw = localStorage.getItem('diffbro.snippets')
    expect(raw).toContain('sql') // tag names are plaintext by design
    expect(raw).not.toContain('SELECT * FROM users') // content is encrypted
  })

  it('a snippet with no tags is the Default catch-all', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'loose note', content: 'hello', language: 'auto', tags: [] })
    expect(store.entries[0].tags).toEqual([])
    expect(store.defaultCount).toBe(1)
  })

  it('caps a snippet at MAX_TAGS and de-duplicates', async () => {
    const store = useSnippetStore()
    const many = Array.from({ length: MAX_TAGS + 4 }, (_, i) => `t${i}`)
    await store.add({ name: 'x', content: 'y', language: 'auto', tags: ['dup', 'dup', ...many] })
    expect(store.entries[0].tags).toHaveLength(MAX_TAGS)
    expect(new Set(store.entries[0].tags).size).toBe(MAX_TAGS) // no duplicates kept
  })

  it('assigns distinct palette colors and honors caller-chosen colors', async () => {
    const store = useSnippetStore()
    await store.add({
      name: 'one',
      content: 'x',
      language: 'auto',
      tags: ['red-ish'],
      tagColors: { 'red-ish': TAG_PALETTE[6] }
    })
    expect(store.tags['red-ish'].color).toBe(TAG_PALETTE[6])
    await store.add({ name: 'two', content: 'x', language: 'auto', tags: ['auto-color'] })
    // Auto-assigned from the palette, and different from the taken one.
    expect(TAG_PALETTE).toContain(store.tags['auto-color'].color)
    expect(store.tags['auto-color'].color).not.toBe(TAG_PALETTE[6])
  })

  it('update() re-encrypts content, renames, changes syntax, and retags', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'todo', content: 'old', language: 'auto', tags: ['a'] })
    await store.update(id, {
      name: 'renamed',
      content: 'new content',
      language: 'python',
      tags: ['b', 'c']
    })
    const e = store.entries[0]
    expect(e.name).toBe('renamed')
    expect(e.language).toBe('python')
    expect(e.tags).toEqual(['b', 'c'])
    await expect(store.load(id)).resolves.toBe('new content')
  })

  it('retagging does NOT re-key (the AAD is fixed to id + salt + createdAt)', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 's', content: 'payload', language: 'auto', tags: ['x'] })
    const salt = store.entries[0].aadSalt
    await store.update(id, { name: 's', content: 'payload', language: 'auto', tags: ['y', 'z'] })
    expect(store.entries[0].aadSalt).toBe(salt) // unchanged
    await expect(store.load(id)).resolves.toBe('payload')
  })

  it('tagList is recency-ordered and counts usage; defaultCount tracks untagged', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['first'] })
    await store.add({ name: 'b', content: 'x', language: 'auto', tags: ['second'] })
    await store.add({ name: 'c', content: 'x', language: 'auto', tags: ['second'] }) // second is more used AND more recent
    await store.add({ name: 'd', content: 'x', language: 'auto', tags: [] }) // Default
    const names = store.tagList.map((t) => t.name)
    expect(names[0]).toBe('second') // most recently used first
    expect(store.tagList.find((t) => t.name === 'second').count).toBe(2)
    expect(store.defaultCount).toBe(1)
  })

  // --- tag management ---
  it('renameTag moves the tag on every snippet and in the registry', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['old'] })
    await store.add({ name: 'b', content: 'x', language: 'auto', tags: ['old', 'keep'] })
    store.renameTag('old', 'new')
    expect(store.tags.old).toBeUndefined()
    expect(store.tags.new).toBeTruthy()
    expect(store.entries.every((e) => !e.tags.includes('old'))).toBe(true)
    expect(store.entries[0].tags).toContain('new')
  })

  it('deleteTag removes it from every snippet (but deletes no snippets)', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['gone', 'stay'] })
    store.deleteTag('gone')
    expect(store.tags.gone).toBeUndefined()
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0].tags).toEqual(['stay'])
  })

  it('recolorTag only accepts palette colors', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['t'] })
    store.recolorTag('t', TAG_PALETTE[3])
    expect(store.tags.t.color).toBe(TAG_PALETTE[3])
    store.recolorTag('t', '#123456') // not in palette — ignored
    expect(store.tags.t.color).toBe(TAG_PALETTE[3])
  })

  // --- delete flow ---
  it('requestDelete/confirmDelete removes a snippet; a tag delete removes the tag', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'doomed', content: 'x', language: 'auto', tags: ['t'] })
    store.requestDelete('snippet', id, 'doomed')
    store.cancelDelete()
    expect(store.entries).toHaveLength(1)
    store.requestDelete('snippet', id, 'doomed')
    store.confirmDelete()
    expect(store.entries).toHaveLength(0)

    const id2 = await store.add({
      name: 'has-tag',
      content: 'x',
      language: 'auto',
      tags: ['victim']
    })
    store.requestDelete('tag', 'victim', 'victim')
    store.confirmDelete()
    expect(store.tags.victim).toBeUndefined()
    expect(store.entries.find((e) => e.id === id2).tags).toEqual([])
  })

  // --- crypto safety ---
  it('drops a snippet whose salt was tampered with (AAD mismatch)', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'victim', content: 'secret', language: 'auto', tags: [] })
    store.entries[0].aadSalt = 'tampered'
    await expect(store.load(id)).resolves.toBeNull()
    expect(store.entries).toHaveLength(0)
  })

  it('never drops a snippet when the vault key is unavailable — it surfaces instead', async () => {
    const store = useSnippetStore()
    const id = await store.add({
      name: 'keep',
      content: 'never lose me',
      language: 'auto',
      tags: []
    })
    window.api.vaultDecrypt = async () => ({ error: 'vault-key-unavailable' })
    await expect(store.load(id)).resolves.toBeNull()
    expect(store.entries).toHaveLength(1)
    expect(store.keyError).toBe('vault-key-unavailable')
    window.api.vaultDecrypt = async (box, aad) => vaultDecrypt(KEY, box, aad)
    await expect(store.load(id)).resolves.toBe('never lose me')
    expect(store.keyError).toBeNull()
  })

  // --- favorites ---
  it('favorites collects favorited snippets and lifts them out of the main list', async () => {
    const store = useSnippetStore()
    const a = await store.add({ name: 'a', content: 'x', language: 'auto', tags: ['t'] })
    const b = await store.add({ name: 'b', content: 'x', language: 'auto', tags: ['t'] })
    // add() stamps createdAt from Date.now(), too fast apart to differ reliably;
    // pin explicit times so the newest-first order is deterministic.
    store.entries.find((e) => e.id === a).createdAt = 1000
    store.entries.find((e) => e.id === b).createdAt = 2000
    expect(store.favorites).toHaveLength(0)
    expect(store.listed.map((e) => e.name)).toEqual(['b', 'a']) // newest first
    store.toggleFavorite(a)
    expect(store.favorites.map((e) => e.name)).toEqual(['a'])
    expect(store.listed.map((e) => e.name)).toEqual(['b'])
    expect(localStorage.getItem('diffbro.snippets')).toContain('"favorite":true')
  })

  it('orders both the Favorites and All shelves newest-created first', async () => {
    const store = useSnippetStore()
    const ids = {}
    for (const n of ['old', 'mid', 'new'])
      ids[n] = await store.add({ name: n, content: 'x', language: 'auto', tags: [] })
    const at = { old: 1000, mid: 2000, new: 3000 }
    for (const e of store.entries) e.createdAt = at[e.name]
    expect(store.listed.map((e) => e.name)).toEqual(['new', 'mid', 'old'])
    store.toggleFavorite(ids.old)
    store.toggleFavorite(ids.new)
    expect(store.favorites.map((e) => e.name)).toEqual(['new', 'old'])
    expect(store.listed.map((e) => e.name)).toEqual(['mid'])
  })

  // --- export / import ---
  it('exports all and reimports into a fresh store with tags + colors intact', async () => {
    const store = useSnippetStore()
    await store.add({
      name: 'find user',
      content: 'SELECT * FROM users',
      language: 'sql',
      tags: ['sql']
    })
    const color = store.tags.sql.color
    expect((await store.exportAll('my-passphrase')).ok).toBe(true)

    setActivePinia(createPinia())
    localStorage.clear()
    const fresh = useSnippetStore()
    const res = await fresh.importSnippets('my-passphrase')
    expect(res.ok).toBe(true)
    expect(fresh.entries).toHaveLength(1)
    expect(fresh.entries[0].tags).toEqual(['sql'])
    expect(fresh.tags.sql.color).toBe(color)
    await expect(fresh.load(fresh.entries[0].id)).resolves.toBe('SELECT * FROM users')
  })

  it('exportTag exports only snippets carrying that tag', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'keep', content: 'A', language: 'auto', tags: ['wanted'] })
    await store.add({ name: 'skip', content: 'B', language: 'auto', tags: ['other'] })
    await store.exportTag('wanted', 'pw')

    setActivePinia(createPinia())
    localStorage.clear()
    const fresh = useSnippetStore()
    await fresh.importSnippets('pw')
    expect(fresh.entries.map((e) => e.name)).toEqual(['keep'])
  })

  it('imports a legacy { categories } bundle, folding each category into a tag', async () => {
    // A bundle produced by the previous (categories) version.
    lastExportedFile = await sealSnippets(
      {
        categories: [
          { name: 'Default', snippets: [{ name: 'loose', content: 'x', language: 'auto' }] },
          { name: 'SQL', snippets: [{ name: 'q', content: 'SELECT 1', language: 'sql' }] }
        ]
      },
      'pw',
      IDENTITY
    )
    const store = useSnippetStore()
    const res = await store.importSnippets('pw')
    expect(res.ok).toBe(true)
    const loose = store.entries.find((e) => e.name === 'loose')
    const q = store.entries.find((e) => e.name === 'q')
    expect(loose.tags).toEqual([]) // "Default" category → untagged
    expect(q.tags).toEqual(['sql']) // "SQL" category → sql tag
  })

  it('importSnippets surfaces a friendly message on the wrong passphrase', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'x', content: 'y', language: 'auto', tags: [] })
    await store.exportAll('right-pw')
    const res = await store.importSnippets('wrong-pw')
    expect(res.ok).toBeUndefined()
    expect(res.message).toBeTruthy()
  })

  // --- migration ---
  it('migrates a legacy { categories, entries } blob without re-encrypting (aadSalt = old categoryId)', async () => {
    const id = 'e1'
    const catId = 'c-sql'
    const createdAt = 1700000000000
    // Encrypt exactly as the old store did: AAD = [id, categoryId, createdAt].
    const box = vaultEncrypt(KEY, 'legacy content', [id, catId, createdAt].join('|'))
    localStorage.setItem(
      'diffbro.snippets',
      JSON.stringify({
        categories: [
          { id: 'c-def', name: 'Default', isDefault: true },
          { id: catId, name: 'SQL' }
        ],
        entries: [
          {
            id,
            categoryId: catId,
            name: 'old snippet',
            createdAt,
            language: 'sql',
            favorite: false,
            iv: box.iv,
            data: box.data
          }
        ]
      })
    )
    setActivePinia(createPinia())
    const store = useSnippetStore()
    const migrated = store.entries[0]
    expect(migrated.aadSalt).toBe(catId) // preserves the AAD binding
    expect(migrated.tags).toEqual(['sql']) // category → tag
    expect(store.tags.sql).toBeTruthy()
    // The whole point: content still decrypts after a metadata-only migration.
    await expect(store.load(id)).resolves.toBe('legacy content')
  })

  // The quick look-up window is a separate Pinia instance and calls reload() on
  // each summon to pick up snippets the main window added meanwhile.
  it('reload() re-reads the library persisted by another window', async () => {
    const store = useSnippetStore()
    await store.add({ name: 'first', content: 'x' })
    expect(store.entries.map((e) => e.name)).toEqual(['first'])
    // Simulate the main window persisting a second snippet to disk.
    const raw = JSON.parse(localStorage.getItem('diffbro.snippets'))
    raw.entries.push({ ...raw.entries[0], id: 'other', name: 'second' })
    localStorage.setItem('diffbro.snippets', JSON.stringify(raw))
    store.reload()
    expect(store.entries.map((e) => e.name)).toEqual(['first', 'second'])
  })
})
