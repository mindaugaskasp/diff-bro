// Integration-style store tests: the mocked window.api routes through the
// REAL main-process crypto (vaultCrypt), so the whole save/load/tamper path
// is exercised — only Electron IPC itself is skipped.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../src/main/vaultCrypt'
import { useVaultStore } from '../src/renderer/src/stores/vaultStore'

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

  it('keeps the sender timestamps on imported entries (simultaneous expiry)', async () => {
    const vault = useVaultStore()
    const createdAt = Date.now() - 1000
    const expiresAt = Date.now() + 1000
    await vault.addShared('from afar', PAYLOAD, createdAt, expiresAt, 'alice')
    expect(vault.entries[0]).toMatchObject({ createdAt, expiresAt, from: 'alice' })
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

  it('save files a diff into a chosen category, and activeInCategory reflects it', async () => {
    const vault = useVaultStore()
    const cat = vault.addCategory('Work')
    await vault.save('work diff', 1, PAYLOAD, cat)
    expect(vault.activeInCategory(cat).map((e) => e.name)).toEqual(['work diff'])
    expect(vault.activeInCategory(vault.defaultCategoryId)).toHaveLength(0)
  })

  it('refuses to delete a category holding active diffs, allows it once emptied', async () => {
    const vault = useVaultStore()
    const cat = vault.addCategory('Temp')
    const id = await vault.save('x', 1, PAYLOAD, cat)
    expect(vault.canDeleteCategory(cat)).toBe(false)
    expect(vault.removeCategory(cat)).toBe(false)
    vault.remove(id)
    expect(vault.canDeleteCategory(cat)).toBe(true)
    expect(vault.removeCategory(cat)).toBe(true)
    expect(vault.categories.some((c) => c.id === cat)).toBe(false)
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

  it('deleting an all-favorited category reassigns its stragglers to Default', async () => {
    const vault = useVaultStore()
    const cat = vault.addCategory('C')
    const id = await vault.save('fav', 1, PAYLOAD, cat)
    vault.toggleFavorite(id) // moves to Favorites; category now shows empty
    expect(vault.canDeleteCategory(cat)).toBe(true)
    expect(vault.removeCategory(cat)).toBe(true)
    expect(vault.entries.find((e) => e.id === id).categoryId).toBe(vault.defaultCategoryId)
    expect(vault.favoritesOwn.map((e) => e.name)).toEqual(['fav'])
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
})
