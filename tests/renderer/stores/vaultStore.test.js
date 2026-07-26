// Integration-style store tests: the mocked window.api routes through the
// REAL main-process crypto (vaultCrypt), so the whole save/load/tamper path
// is exercised — only Electron IPC itself is skipped.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'

const KEY = randomBytes(32)
const PAYLOAD = { mode: 'paste', pasteLeft: 'secret left', pasteRight: 'secret right' }

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    vaultEncrypt: async (plaintext, aad) => vaultEncrypt(KEY, plaintext, aad),
    vaultDecrypt: async (box, aad) => vaultDecrypt(KEY, box, aad)
  }
})

describe('vaultStore', () => {
  it('saves and loads a diff, returning the exact payload', async () => {
    const vault = useVaultStore()
    const id = await vault.save('my diff', 1, PAYLOAD)
    expect(id).toBeTruthy()
    expect(vault.active).toHaveLength(1)
    expect(vault.active[0].name).toBe('my diff')
    expect(vault.active[0].from).toBeNull()
    await expect(vault.load(id)).resolves.toEqual(PAYLOAD)
  })

  it('stores only ciphertext in localStorage', async () => {
    const vault = useVaultStore()
    await vault.save('my diff', 1, PAYLOAD)
    const raw = localStorage.getItem('diffbro.vault')
    expect(raw).toContain('my diff') // name is plaintext by design
    expect(raw).not.toContain('secret left')
  })

  it('clamps the TTL to the 24 h maximum', async () => {
    const vault = useVaultStore()
    await vault.save('long', 9999, PAYLOAD)
    const entry = vault.entries[0]
    expect(entry.expiresAt - entry.createdAt).toBeLessThanOrEqual(24 * 3600_000)
  })

  it('ttlHours null saves a kept (non-expiring) diff that survives tick and loads', async () => {
    const vault = useVaultStore()
    const id = await vault.save('kept', null, PAYLOAD)
    expect(vault.entries[0].expiresAt).toBeNull()
    expect(vault.active).toHaveLength(1)
    vault.tick() // the purge pass must never remove a null-expiry entry
    expect(vault.entries.some((e) => e.id === id)).toBe(true)
    await expect(vault.load(id)).resolves.toEqual(PAYLOAD)
  })

  it('sharing a kept diff seals it with a fresh ≤24 h expiry', async () => {
    const vault = useVaultStore()
    let sealed = null
    window.api.shareExport = async (entry) => ((sealed = entry), { ok: true, to: 'bob' })
    const id = await vault.save('kept', null, PAYLOAD)
    await vault.share(id, 'FP')
    expect(sealed.expiresAt).toBeGreaterThan(Date.now())
    expect(sealed.expiresAt - sealed.createdAt).toBeLessThanOrEqual(24 * 3600_000)
  })

  it('sharing a secure diff keeps its own timestamps', async () => {
    const vault = useVaultStore()
    let sealed = null
    window.api.shareExport = async (entry) => ((sealed = entry), { ok: true })
    const id = await vault.save('secure', 1, PAYLOAD)
    const entry = vault.entries[0]
    await vault.share(id, 'FP')
    expect(sealed.expiresAt).toBe(entry.expiresAt)
    expect(sealed.createdAt).toBe(entry.createdAt)
  })

  it('keeps the sender timestamps on imported entries (simultaneous expiry)', async () => {
    const vault = useVaultStore()
    const createdAt = Date.now() - 1000
    const expiresAt = Date.now() + 1000
    await vault.addShared({
      name: 'from afar',
      payload: PAYLOAD,
      createdAt,
      expiresAt,
      from: 'alice'
    })
    expect(vault.entries[0]).toMatchObject({ createdAt, expiresAt, from: 'alice' })
  })

  it('splits shared-in diffs into a Favorites shelf and the rest (own diffs excluded)', async () => {
    const vault = useVaultStore()
    const soon = Date.now() + 3600_000
    await vault.save('mine', 1, PAYLOAD) // own diff — never in the External shelves
    await vault.addShared({
      name: 'from alice',
      payload: PAYLOAD,
      createdAt: Date.now(),
      expiresAt: soon,
      from: 'alice'
    })
    const bob = await (async () => {
      await vault.addShared({
        name: 'from bob',
        payload: PAYLOAD,
        createdAt: Date.now(),
        expiresAt: soon,
        from: 'bob'
      })
      return vault.entries.find((e) => e.from === 'bob').id
    })()
    expect(vault.importedFavorites).toHaveLength(0)
    expect(vault.importedOthers.map((e) => e.name).sort()).toEqual(['from alice', 'from bob'])
    vault.toggleFavorite(bob)
    expect(vault.importedFavorites.map((e) => e.name)).toEqual(['from bob'])
    expect(vault.importedOthers.map((e) => e.name)).toEqual(['from alice'])
    // an own favorited diff must NOT leak into the external shelves
    expect([...vault.importedFavorites, ...vault.importedOthers].some((e) => e.from === null)).toBe(
      false
    )
  })

  it('tick() purges expired entries from state and storage', async () => {
    const vault = useVaultStore()
    await vault.save('doomed', 1, PAYLOAD)
    vault.entries[0].expiresAt = Date.now() - 1
    vault.tick()
    expect(vault.entries).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('diffbro.vault')).entries).toEqual([])
  })

  it('seeds a persisted, non-deletable Default category and files saves into it', async () => {
    const vault = useVaultStore()
    expect(vault.categories.some((c) => c.isDefault && c.name === 'Default')).toBe(true)
    const id = await vault.save('d', 1, PAYLOAD)
    expect(vault.entries.find((e) => e.id === id).categoryId).toBe(vault.defaultCategoryId)
    expect(vault.canDeleteCategory(vault.defaultCategoryId)).toBe(false)
    expect(vault.removeCategory(vault.defaultCategoryId)).toBe(false)
  })

  it('normalizes a category name to one leading capital then lowercase', () => {
    const vault = useVaultStore()
    const nameOf = (id) => vault.categories.find((c) => c.id === id).name
    expect(nameOf(vault.addCategory('RELEASE notes'))).toBe('Release notes')
    expect(nameOf(vault.addCategory('  work stuff  '))).toBe('Work stuff')
    expect(nameOf(vault.addCategory('API'))).toBe('Api')
    expect(nameOf(vault.addCategory('   '))).toBe('Untitled')
  })

  it('save files a diff into a chosen category, and activeInCategory reflects it', async () => {
    const vault = useVaultStore()
    const cat = vault.addCategory('Work')
    await vault.save('work diff', 1, PAYLOAD, cat)
    expect(vault.activeInCategory(cat).map((e) => e.name)).toEqual(['work diff'])
    expect(vault.activeInCategory(vault.defaultCategoryId)).toHaveLength(0)
  })

  it('deleting a category deletes the diffs filed under it', async () => {
    const vault = useVaultStore()
    const cat = vault.addCategory('Temp')
    const id = await vault.save('x', 1, PAYLOAD, cat)
    expect(vault.diffsInCategory(cat).map((e) => e.name)).toEqual(['x'])
    expect(vault.canDeleteCategory(cat)).toBe(true) // any non-Default category
    expect(vault.removeCategory(cat)).toBe(true)
    expect(vault.categories.some((c) => c.id === cat)).toBe(false)
    expect(vault.entries.some((e) => e.id === id)).toBe(false) // the diff is gone too
  })

  it('never deletes the Default category', () => {
    const vault = useVaultStore()
    expect(vault.canDeleteCategory(vault.defaultCategoryId)).toBe(false)
    expect(vault.removeCategory(vault.defaultCategoryId)).toBe(false)
  })

  it('lifts favorited own diffs into favoritesOwn and out of their category', async () => {
    const vault = useVaultStore()
    const cat = vault.addCategory('C')
    const id = await vault.save('fav', 1, PAYLOAD, cat)
    expect(vault.activeInCategory(cat).map((e) => e.name)).toEqual(['fav'])
    vault.toggleFavorite(id)
    expect(vault.activeInCategory(cat)).toHaveLength(0)
    expect(vault.favoritesOwn.map((e) => e.name)).toEqual(['fav'])
  })

  it('deleting a category also deletes its favorited diffs (they count as its diffs)', async () => {
    const vault = useVaultStore()
    const cat = vault.addCategory('C')
    const id = await vault.save('fav', 1, PAYLOAD, cat)
    vault.toggleFavorite(id) // shows under the Favorites folder, still filed in C
    expect(vault.diffsInCategory(cat).map((e) => e.name)).toEqual(['fav']) // still counts
    expect(vault.removeCategory(cat)).toBe(true)
    expect(vault.entries.some((e) => e.id === id)).toBe(false)
    expect(vault.favoritesOwn).toHaveLength(0)
  })

  it('keeps the category after its diff expires (category persists independently)', async () => {
    const vault = useVaultStore()
    const cat = vault.addCategory('Keep')
    await vault.save('doomed', 1, PAYLOAD, cat)
    vault.entries[0].expiresAt = Date.now() - 1
    vault.tick()
    expect(vault.activeInCategory(cat)).toHaveLength(0)
    expect(vault.categories.some((c) => c.id === cat)).toBe(true)
  })

  it('migrates a legacy bare-array vault into { categories, entries } with a Default', () => {
    const legacy = [
      {
        id: 'old1',
        name: 'legacy diff',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600_000,
        from: null,
        iv: 'x',
        data: 'y'
      }
    ]
    localStorage.setItem('diffbro.vault', JSON.stringify(legacy))
    setActivePinia(createPinia())
    const vault = useVaultStore()
    expect(vault.categories.some((c) => c.isDefault)).toBe(true)
    expect(vault.entries[0].categoryId).toBe(vault.defaultCategoryId)
  })

  it('refuses to load an expired entry', async () => {
    const vault = useVaultStore()
    const id = await vault.save('doomed', 1, PAYLOAD)
    vault.entries[0].expiresAt = Date.now() - 1
    await expect(vault.load(id)).resolves.toBeNull()
  })

  it('drops an entry whose metadata was tampered with (AAD mismatch)', async () => {
    const vault = useVaultStore()
    const id = await vault.save('victim', 1, PAYLOAD)
    // simulate an attacker extending the expiry directly in storage
    vault.entries[0].expiresAt += 3600_000
    await expect(vault.load(id)).resolves.toBeNull()
    expect(vault.entries).toHaveLength(0)
  })

  it('does NOT purge entries when the vault key is unavailable — it surfaces instead', async () => {
    const vault = useVaultStore()
    const id = await vault.save('precious', 1, PAYLOAD)
    // The main process can't load the key (e.g. locked keychain): decrypt
    // returns a distinct error object, not null. The entry must survive.
    window.api.vaultDecrypt = async () => ({ error: 'vault-key-unavailable' })
    await expect(vault.load(id)).resolves.toBeNull()
    expect(vault.entries).toHaveLength(1) // NOT purged
    expect(vault.keyError).toBe('vault-key-unavailable')

    // Once the key comes back, the same entry loads cleanly and clears the flag.
    window.api.vaultDecrypt = async (box, aad) => vaultDecrypt(KEY, box, aad)
    await expect(vault.load(id)).resolves.toEqual(PAYLOAD)
    expect(vault.keyError).toBeNull()
  })

  it('save returns null and persists nothing when the vault key is unavailable', async () => {
    const vault = useVaultStore()
    window.api.vaultEncrypt = async () => ({ error: 'vault-key-unavailable' })
    await expect(vault.save('nope', 1, PAYLOAD)).resolves.toBeNull()
    expect(vault.entries).toHaveLength(0)
    expect(vault.keyError).toBe('vault-key-unavailable')
  })

  it('remove() deletes an entry immediately', async () => {
    const vault = useVaultStore()
    const id = await vault.save('gone soon', 1, PAYLOAD)
    vault.remove(id)
    expect(vault.entries).toHaveLength(0)
  })

  it('toggleFavorite flips the flag and persists it', async () => {
    const vault = useVaultStore()
    const id = await vault.save('star me', 1, PAYLOAD)
    expect(vault.entries[0].favorite).toBeFalsy()
    vault.toggleFavorite(id)
    expect(vault.entries[0].favorite).toBe(true)
    expect(localStorage.getItem('diffbro.vault')).toContain('"favorite":true')
    vault.toggleFavorite(id)
    expect(vault.entries[0].favorite).toBe(false)
  })

  it('active sorts favorites to the top, preserving order otherwise', async () => {
    const vault = useVaultStore()
    await vault.save('first', 1, PAYLOAD)
    await vault.save('second', 1, PAYLOAD)
    const thirdId = await vault.save('third', 1, PAYLOAD)
    vault.toggleFavorite(thirdId)
    expect(vault.active.map((e) => e.name)).toEqual(['third', 'first', 'second'])
  })
  it('share seals the decrypted payload for the chosen recipient', async () => {
    const vault = useVaultStore()
    const id = await vault.save('to share', 1, PAYLOAD)
    let sealed = null
    window.api.shareExport = async (entry, recipientFp) => {
      sealed = { entry, recipientFp }
      return { ok: true, to: 'Alice', path: '/tmp/x.diffbro' }
    }
    const res = await vault.share(id, 'AB:CD')
    expect(res.ok).toBe(true)
    expect(sealed.recipientFp).toBe('AB:CD')
    // The recipient gets the plaintext snapshot plus the sender's timestamps.
    expect(sealed.entry.snapshot).toEqual(PAYLOAD)
    expect(sealed.entry.name).toBe('to share')
  })

  it('share reports missing rather than sealing an entry that is gone or expired', async () => {
    const vault = useVaultStore()
    await expect(vault.share('nope', 'AB:CD')).resolves.toEqual({ error: 'missing' })

    const id = await vault.save('doomed', 1, PAYLOAD)
    vault.entries[0].expiresAt = Date.now() - 1
    await expect(vault.share(id, 'AB:CD')).resolves.toEqual({ error: 'missing' })
  })

  it('importShared files the received diff under the sender, keeping its expiry', async () => {
    const vault = useVaultStore()
    const createdAt = Date.now() - 5000
    const expiresAt = Date.now() + 5000
    window.api.shareImport = async () => ({
      ok: true,
      from: 'alice',
      entry: { name: 'hers', snapshot: PAYLOAD, createdAt, expiresAt }
    })
    const res = await vault.importShared()
    expect(res.ok).toBe(true)
    expect(vault.entries[0]).toMatchObject({ name: 'hers', from: 'alice', createdAt, expiresAt })
  })

  it('a failed import adds nothing', async () => {
    const vault = useVaultStore()
    window.api.shareImport = async () => ({ error: 'not-for-you' })
    const res = await vault.importShared()
    expect(res.error).toBe('not-for-you')
    expect(vault.entries).toHaveLength(0)
  })

  it('importSharedFromPath files the dropped diff and returns its new id', async () => {
    const vault = useVaultStore()
    const createdAt = Date.now() - 5000
    const expiresAt = Date.now() + 5000
    window.api.shareImportPath = async (path) => ({
      ok: true,
      from: 'alice',
      entry: {
        name: path.endsWith('.diffbro') ? 'dropped' : 'x',
        snapshot: PAYLOAD,
        createdAt,
        expiresAt
      }
    })
    const res = await vault.importSharedFromPath('/tmp/whatever.diffbro')
    expect(res.ok).toBe(true)
    expect(res.id).toBe(vault.entries[0].id)
    expect(vault.entries[0]).toMatchObject({ name: 'dropped', from: 'alice', createdAt, expiresAt })
  })

  it('a failed importSharedFromPath adds nothing and carries no id', async () => {
    const vault = useVaultStore()
    window.api.shareImportPath = async () => ({ error: 'not-a-share-file' })
    const res = await vault.importSharedFromPath('/tmp/nope.diffbro')
    expect(res.error).toBe('not-a-share-file')
    expect(res.id).toBeUndefined()
    expect(vault.entries).toHaveLength(0)
  })

  it('the delete confirmation is what actually removes a diff or a category', async () => {
    const vault = useVaultStore()
    const id = await vault.save('victim', 1, PAYLOAD)
    vault.requestDelete('entry', id, 'victim')
    expect(vault.entries).toHaveLength(1) // asking is not doing
    vault.cancelDelete()
    expect(vault.pendingDelete).toBeNull()
    expect(vault.entries).toHaveLength(1)

    vault.requestDelete('entry', id, 'victim')
    vault.confirmDelete()
    expect(vault.entries).toHaveLength(0)

    const cat = vault.addCategory('Temp')
    vault.requestDelete('category', cat, 'Temp')
    vault.confirmDelete()
    expect(vault.categories.some((c) => c.id === cat)).toBe(false)
  })

  it('confirmDelete with nothing pending is a no-op', async () => {
    const vault = useVaultStore()
    await vault.save('safe', 1, PAYLOAD)
    vault.confirmDelete()
    expect(vault.entries).toHaveLength(1)
  })

  it('surfaces a key failure instead of dropping the entry', async () => {
    const vault = useVaultStore()
    window.api.vaultEncrypt = async () => ({ error: 'vault-key-unavailable' })
    const id = await vault.save('unsaveable', 1, PAYLOAD)
    expect(id).toBeNull()
    expect(vault.entries).toHaveLength(0)
    expect(vault.keyError).toBe('vault-key-unavailable')
  })
})
