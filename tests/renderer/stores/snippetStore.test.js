// Integration-style store tests: the mocked window.api routes through the
// REAL main-process crypto (vaultCrypt + snippetSealing), so the whole
// save/load/export/import/tamper path is exercised — only Electron IPC
// itself (file dialogs) is skipped.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import { createIdentityKeys } from '../../../src/main/sealing'
import { openSnippets, sealSnippets } from '../../../src/main/snippetSealing'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'

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
      lastExportedFile = sealSnippets(bundle, passphrase, IDENTITY)
      return { ok: true, path: '/tmp/fake.diffbrosnip' }
    },
    importSnippets: async (passphrase) => {
      if (!lastExportedFile) return { error: 'not-a-snippet-file' }
      return openSnippets(lastExportedFile, passphrase)
    }
  }
})

describe('snippetStore', () => {
  it('seeds a persisted, non-deletable "Default" category on first launch', () => {
    const store = useSnippetStore()
    expect(store.categories).toHaveLength(1)
    expect(store.categories[0].name).toBe('Default')
    expect(store.categories[0].isDefault).toBe(true)
    expect(store.defaultCategoryId).toBe(store.categories[0].id)
    expect(localStorage.getItem('diffbro.snippets')).toContain('Default')
  })

  it('refuses to delete the Default category', () => {
    const store = useSnippetStore()
    const defaultId = store.defaultCategoryId
    expect(store.canDeleteCategory(defaultId)).toBe(false)
    expect(store.removeCategory(defaultId)).toBe(false)
    expect(store.categories).toHaveLength(1)
  })

  it('re-adds a Default category if none is present (guaranteed fallback)', () => {
    // Simulate legacy/tampered storage with no default category.
    localStorage.setItem(
      'diffbro.snippets',
      JSON.stringify({ categories: [{ id: 'x', name: 'Only' }], entries: [] })
    )
    setActivePinia(createPinia())
    const store = useSnippetStore()
    expect(store.categories.some((c) => c.isDefault && c.name === 'Default')).toBe(true)
  })

  it('creates a category and adds a snippet to it, encrypted at rest', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('SQL')
    expect(store.categories).toHaveLength(2) // Default (seeded) + SQL
    const id = await store.add(catId, 'find user', 'SELECT * FROM users')
    expect(store.inCategory(catId)).toHaveLength(1)
    await expect(store.load(id)).resolves.toBe('SELECT * FROM users')

    const raw = localStorage.getItem('diffbro.snippets')
    expect(raw).toContain('SQL') // category name is plaintext by design
    expect(raw).not.toContain('SELECT * FROM users') // content is encrypted
  })

  it('update() re-encrypts content and renames in place', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('Notes')
    const id = await store.add(catId, 'todo', 'old content')
    await store.update(id, 'renamed', 'new content')
    expect(store.entries[0].name).toBe('renamed')
    await expect(store.load(id)).resolves.toBe('new content')
  })

  it('refuses to delete a non-empty category, then allows it once emptied', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('Temp')
    const snippetId = await store.add(catId, 'a', 'content a')

    expect(store.canDeleteCategory(catId)).toBe(false)
    expect(store.removeCategory(catId)).toBe(false)
    expect(store.categories.some((c) => c.id === catId)).toBe(true)

    store.remove(snippetId)
    expect(store.canDeleteCategory(catId)).toBe(true)
    expect(store.removeCategory(catId)).toBe(true)
    expect(store.categories.some((c) => c.id === catId)).toBe(false)
  })

  it('persists a chosen language on add and lets update change it', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('Code')
    const id = await store.add(catId, 'query', 'SELECT 1', 'sql')
    expect(store.entries.find((e) => e.id === id).language).toBe('sql')
    await store.update(id, 'query', 'SELECT 1', catId, 'python')
    expect(store.entries.find((e) => e.id === id).language).toBe('python')
  })

  it('defaults a snippet language to auto when none is given', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('Misc')
    const id = await store.add(catId, 'note', 'hello')
    expect(store.entries.find((e) => e.id === id).language).toBe('auto')
  })

  it('update() can move a snippet to another category, re-binding its AAD', async () => {
    const store = useSnippetStore()
    const from = store.addCategory('From')
    const to = store.addCategory('To')
    const id = await store.add(from, 'movable', 'payload')
    await store.update(id, 'movable', 'payload', to)
    expect(store.entries[0].categoryId).toBe(to)
    // Still decryptable after the move (AAD re-bound to the new category).
    await expect(store.load(id)).resolves.toBe('payload')
  })

  it('requestDelete + confirmDelete removes a snippet; cancelDelete does not', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('Cat')
    const id = await store.add(catId, 'doomed', 'x')

    store.requestDelete('snippet', id, 'doomed')
    expect(store.pendingDelete).toMatchObject({ type: 'snippet', id })
    store.cancelDelete()
    expect(store.pendingDelete).toBeNull()
    expect(store.entries).toHaveLength(1)

    store.requestDelete('snippet', id, 'doomed')
    store.confirmDelete()
    expect(store.pendingDelete).toBeNull()
    expect(store.entries).toHaveLength(0)
  })

  it('drops a snippet whose metadata was tampered with (AAD mismatch)', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('Cat')
    const id = await store.add(catId, 'victim', 'secret')
    // Simulate an attacker moving the entry to a different category
    // directly in storage — the AAD no longer matches at decrypt time.
    store.entries[0].categoryId = 'someone-elses-category'
    await expect(store.load(id)).resolves.toBeNull()
    expect(store.entries).toHaveLength(0)
  })

  it('exports a category and reimports it into a fresh store, passphrase-protected', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('SQL')
    await store.add(catId, 'find user', 'SELECT * FROM users')

    const exportRes = await store.exportCategory(catId, 'my-passphrase')
    expect(exportRes.ok).toBe(true)

    // Fresh install / fresh store — nothing local yet.
    setActivePinia(createPinia())
    localStorage.clear()
    const fresh = useSnippetStore()
    const importRes = await fresh.importSnippets('my-passphrase')
    expect(importRes.ok).toBe(true)
    expect(fresh.categories).toHaveLength(2) // Default (seeded) + imported SQL
    const sqlCategory = fresh.categories.find((c) => c.name === 'SQL')
    expect(sqlCategory).toBeTruthy()
    const importedEntry = fresh.inCategory(sqlCategory.id)[0]
    expect(importedEntry.name).toBe('find user')
    await expect(fresh.load(importedEntry.id)).resolves.toBe('SELECT * FROM users')
  })

  it('importSnippets merges into an existing category with the same name instead of duplicating it', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('SQL')
    await store.add(catId, 'first', 'SELECT 1')
    await store.exportCategory(catId, 'pw')
    await store.add(catId, 'second', 'SELECT 2') // added after export, local-only

    await store.importSnippets('pw') // reimports the 1-snippet exported bundle
    expect(store.categories).toHaveLength(2) // Default (seeded) + SQL, not a duplicate SQL
    expect(store.inCategory(catId)).toHaveLength(3) // first, second, + reimported first
  })

  it('toggleFavorite pins a snippet to the top of its category', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('SQL')
    await store.add(catId, 'first', 'SELECT 1')
    await store.add(catId, 'second', 'SELECT 2')
    const thirdId = await store.add(catId, 'third', 'SELECT 3')

    expect(store.inCategory(catId).map((e) => e.name)).toEqual(['first', 'second', 'third'])
    store.toggleFavorite(thirdId)
    expect(store.inCategory(catId).map((e) => e.name)).toEqual(['third', 'first', 'second'])
    expect(localStorage.getItem('diffbro.snippets')).toContain('"favorite":true')
  })

  it('favorites getter collects favorited snippets across all categories', async () => {
    const store = useSnippetStore()
    const a = store.addCategory('A')
    const b = store.addCategory('B')
    const a1 = await store.add(a, 'a1', 'x')
    await store.add(a, 'a2', 'x')
    const b1 = await store.add(b, 'b1', 'x')

    expect(store.favorites).toHaveLength(0)
    store.toggleFavorite(a1)
    store.toggleFavorite(b1)
    expect(store.favorites.map((e) => e.name).sort()).toEqual(['a1', 'b1'])
    store.toggleFavorite(a1)
    expect(store.favorites.map((e) => e.name)).toEqual(['b1'])
  })

  it('importSnippets surfaces a friendly message on wrong passphrase', async () => {
    const store = useSnippetStore()
    const catId = store.addCategory('SQL')
    await store.add(catId, 'x', 'y')
    await store.exportCategory(catId, 'right-pw')
    const res = await store.importSnippets('wrong-pw')
    expect(res.ok).toBeUndefined()
    expect(res.message).toBeTruthy()
  })
})
