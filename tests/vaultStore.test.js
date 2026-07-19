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
    expect(localStorage.getItem('diffbro.vault')).toBe('[]')
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
})
