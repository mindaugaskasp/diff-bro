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
import { TAG_PALETTE, useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'

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

describe('snippetStore — tags model', () => {
  it('starts empty (no categories; Default is the implicit catch-all)', () => {
    const store = useSnippetStore()
    expect(store.entries).toEqual([])
    expect(store.tags).toEqual({})
    expect(store.pinnedTags).toEqual([])
    expect(store.defaultCount).toBe(0)
  })

  it('adds a tagged snippet, encrypted at rest, and registers its tags', async () => {
    const store = useSnippetStore()
    const id = await store.add('find user', 'SELECT * FROM users', 'sql', ['sql', 'postgres'])
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
    await store.add('loose note', 'hello', 'auto', [])
    expect(store.entries[0].tags).toEqual([])
    expect(store.defaultCount).toBe(1)
  })

  it('caps a snippet at 5 tags and de-duplicates', async () => {
    const store = useSnippetStore()
    await store.add('x', 'y', 'auto', ['a', 'b', 'a', 'c', 'd', 'e', 'f'])
    expect(store.entries[0].tags).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('assigns distinct palette colors and honors caller-chosen colors', async () => {
    const store = useSnippetStore()
    await store.add('one', 'x', 'auto', ['red-ish'], { 'red-ish': TAG_PALETTE[6] })
    expect(store.tags['red-ish'].color).toBe(TAG_PALETTE[6])
    await store.add('two', 'x', 'auto', ['auto-color'])
    // Auto-assigned from the palette, and different from the taken one.
    expect(TAG_PALETTE).toContain(store.tags['auto-color'].color)
    expect(store.tags['auto-color'].color).not.toBe(TAG_PALETTE[6])
  })

  it('update() re-encrypts content, renames, changes syntax, and retags', async () => {
    const store = useSnippetStore()
    const id = await store.add('todo', 'old', 'auto', ['a'])
    await store.update(id, 'renamed', 'new content', 'python', ['b', 'c'])
    const e = store.entries[0]
    expect(e.name).toBe('renamed')
    expect(e.language).toBe('python')
    expect(e.tags).toEqual(['b', 'c'])
    await expect(store.load(id)).resolves.toBe('new content')
  })

  it('retagging does NOT re-key (the AAD is fixed to id + salt + createdAt)', async () => {
    const store = useSnippetStore()
    const id = await store.add('s', 'payload', 'auto', ['x'])
    const salt = store.entries[0].aadSalt
    await store.update(id, 's', 'payload', 'auto', ['y', 'z'])
    expect(store.entries[0].aadSalt).toBe(salt) // unchanged
    await expect(store.load(id)).resolves.toBe('payload')
  })

  it('tagList is recency-ordered and counts usage; defaultCount tracks untagged', async () => {
    const store = useSnippetStore()
    await store.add('a', 'x', 'auto', ['first'])
    await store.add('b', 'x', 'auto', ['second'])
    await store.add('c', 'x', 'auto', ['second']) // second is more used AND more recent
    await store.add('d', 'x', 'auto', []) // Default
    const names = store.tagList.map((t) => t.name)
    expect(names[0]).toBe('second') // most recently used first
    expect(store.tagList.find((t) => t.name === 'second').count).toBe(2)
    expect(store.defaultCount).toBe(1)
  })

  // --- tag management ---
  it('renameTag moves the tag on every snippet and in the registry', async () => {
    const store = useSnippetStore()
    await store.add('a', 'x', 'auto', ['old'])
    await store.add('b', 'x', 'auto', ['old', 'keep'])
    store.renameTag('old', 'new')
    expect(store.tags.old).toBeUndefined()
    expect(store.tags.new).toBeTruthy()
    expect(store.entries.every((e) => !e.tags.includes('old'))).toBe(true)
    expect(store.entries[0].tags).toContain('new')
  })

  it('deleteTag removes it from every snippet (but deletes no snippets) and unpins it', async () => {
    const store = useSnippetStore()
    await store.add('a', 'x', 'auto', ['gone', 'stay'])
    store.pinTag('gone')
    store.deleteTag('gone')
    expect(store.tags.gone).toBeUndefined()
    expect(store.entries).toHaveLength(1)
    expect(store.entries[0].tags).toEqual(['stay'])
    expect(store.pinnedTags).not.toContain('gone')
  })

  it('recolorTag only accepts palette colors', async () => {
    const store = useSnippetStore()
    await store.add('a', 'x', 'auto', ['t'])
    store.recolorTag('t', TAG_PALETTE[3])
    expect(store.tags.t.color).toBe(TAG_PALETTE[3])
    store.recolorTag('t', '#123456') // not in palette — ignored
    expect(store.tags.t.color).toBe(TAG_PALETTE[3])
  })

  // --- Quick Access pinning ---
  it('pins, reorders, and unpins tags for the Quick Access shelf', async () => {
    const store = useSnippetStore()
    await store.add('a', 'x', 'auto', ['one', 'two', 'three'])
    store.pinTag('one')
    store.pinTag('two')
    store.pinTag('three')
    expect(store.pinnedTags).toEqual(['one', 'two', 'three'])
    // Move 'three' before 'one'.
    store.pinTag('three', 'one')
    expect(store.pinnedTags).toEqual(['three', 'one', 'two'])
    store.unpinTag('one')
    expect(store.pinnedTags).toEqual(['three', 'two'])
    expect(store.pinnedShelf.map((t) => t.name)).toEqual(['three', 'two'])
  })

  it('refuses to pin a tag that does not exist', () => {
    const store = useSnippetStore()
    store.pinTag('ghost')
    expect(store.pinnedTags).toEqual([])
  })

  // --- delete flow ---
  it('requestDelete/confirmDelete removes a snippet; a tag delete removes the tag', async () => {
    const store = useSnippetStore()
    const id = await store.add('doomed', 'x', 'auto', ['t'])
    store.requestDelete('snippet', id, 'doomed')
    store.cancelDelete()
    expect(store.entries).toHaveLength(1)
    store.requestDelete('snippet', id, 'doomed')
    store.confirmDelete()
    expect(store.entries).toHaveLength(0)

    const id2 = await store.add('has-tag', 'x', 'auto', ['victim'])
    store.requestDelete('tag', 'victim', 'victim')
    store.confirmDelete()
    expect(store.tags.victim).toBeUndefined()
    expect(store.entries.find((e) => e.id === id2).tags).toEqual([])
  })

  // --- crypto safety ---
  it('drops a snippet whose salt was tampered with (AAD mismatch)', async () => {
    const store = useSnippetStore()
    const id = await store.add('victim', 'secret', 'auto', [])
    store.entries[0].aadSalt = 'tampered'
    await expect(store.load(id)).resolves.toBeNull()
    expect(store.entries).toHaveLength(0)
  })

  it('never drops a snippet when the vault key is unavailable — it surfaces instead', async () => {
    const store = useSnippetStore()
    const id = await store.add('keep', 'never lose me', 'auto', [])
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
    const a = await store.add('a', 'x', 'auto', ['t'])
    await store.add('b', 'x', 'auto', ['t'])
    expect(store.favorites).toHaveLength(0)
    expect(store.listed.map((e) => e.name)).toEqual(['a', 'b'])
    store.toggleFavorite(a)
    expect(store.favorites.map((e) => e.name)).toEqual(['a'])
    expect(store.listed.map((e) => e.name)).toEqual(['b'])
    expect(localStorage.getItem('diffbro.snippets')).toContain('"favorite":true')
  })

  // --- export / import ---
  it('exports all and reimports into a fresh store with tags + colors intact', async () => {
    const store = useSnippetStore()
    await store.add('find user', 'SELECT * FROM users', 'sql', ['sql'])
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
    await store.add('keep', 'A', 'auto', ['wanted'])
    await store.add('skip', 'B', 'auto', ['other'])
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
    await store.add('x', 'y', 'auto', [])
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
})
