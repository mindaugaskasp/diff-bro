// Integration-style store tests: the mocked window.api routes through the
// REAL main-process crypto (vaultCrypt), so the whole save/load/tamper path
// is exercised — only Electron IPC itself is skipped.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import {
  MAX_KEEP_HOURS,
  TTL_OPTIONS,
  useVaultStore
} from '../../../src/renderer/src/stores/vaultStore'
import { TAG_PALETTE, useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'

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

  it("records the compared files' format on the entry (for the row's type monogram)", async () => {
    const vault = useVaultStore()
    const id = await vault.save('cfg', 1, {
      mode: 'file',
      left: { name: 'config.json' },
      right: { name: 'config.json' }
    })
    expect(vault.entries.find((e) => e.id === id).format).toBe('json')
  })

  it('leaves format null for a paste diff with no filename', async () => {
    const vault = useVaultStore()
    await vault.save('p', 1, PAYLOAD)
    expect(vault.entries[0].format).toBeNull()
  })

  it('stores only ciphertext in localStorage', async () => {
    const vault = useVaultStore()
    await vault.save('my diff', 1, PAYLOAD)
    const raw = localStorage.getItem('diffbro.vault')
    expect(raw).toContain('my diff') // name is plaintext by design
    expect(raw).not.toContain('secret left')
  })

  it('clamps the TTL to the keep ceiling', async () => {
    const vault = useVaultStore()
    await vault.save('long', 9999, PAYLOAD)
    const entry = vault.entries[0]
    expect(entry.expiresAt - entry.createdAt).toBeLessThanOrEqual(MAX_KEEP_HOURS * 3600_000)
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

  it('sharing a kept diff seals it with a fresh full-length expiry', async () => {
    const vault = useVaultStore()
    let sealed = null
    window.api.shareExport = async (entry) => ((sealed = entry), { ok: true, to: 'bob' })
    const id = await vault.save('kept', null, PAYLOAD)
    await vault.share(id, 'FP')
    expect(sealed.expiresAt).toBeGreaterThan(Date.now())
    expect(sealed.expiresAt - sealed.createdAt).toBe(MAX_KEEP_HOURS * 3600_000)
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

  it('shares a diff with its tags but strips the local "imported" tag', async () => {
    const vault = useVaultStore()
    let sealed = null
    window.api.shareExport = async (entry) => ((sealed = entry), { ok: true })
    const id = await vault.save('t', 1, PAYLOAD, ['release', 'imported'])
    await vault.share(id, 'FP')
    expect(sealed.tags).toContain('release')
    expect(sealed.tags).not.toContain('imported')
  })

  it('shareDraft persists a local twin only once the sealed file is written', async () => {
    const vault = useVaultStore()
    let sealed = null
    window.api.shareExport = async (entry) => (
      (sealed = entry),
      { ok: true, to: 'bob', path: '/x' }
    )
    const res = await vault.shareDraft(
      { name: 'd', ttlHours: 1, snapshot: PAYLOAD, tags: ['release'] },
      'FP'
    )
    expect(res.ok).toBe(true)
    expect(sealed.snapshot).toEqual(PAYLOAD)
    expect(vault.entries).toHaveLength(1)
    expect(vault.entries[0].name).toBe('d')
    await expect(vault.load(vault.entries[0].id)).resolves.toEqual(PAYLOAD)
  })

  it('shareDraft persists nothing when the file dialog is cancelled', async () => {
    const vault = useVaultStore()
    window.api.shareExport = async () => ({ canceled: true })
    const res = await vault.shareDraft(
      { name: 'd', ttlHours: 1, snapshot: PAYLOAD, tags: [] },
      'FP'
    )
    expect(res).toEqual({ canceled: true })
    expect(vault.entries).toHaveLength(0)
  })

  it('shareDraft: a kept draft seals a fresh full-length copy, twin stays kept', async () => {
    const vault = useVaultStore()
    let sealed = null
    window.api.shareExport = async (entry) => (
      (sealed = entry),
      { ok: true, to: 'bob', path: '/x' }
    )
    await vault.shareDraft({ name: 'kept', ttlHours: null, snapshot: PAYLOAD, tags: [] }, 'FP')
    expect(sealed.expiresAt).toBeGreaterThan(Date.now())
    expect(sealed.expiresAt - sealed.createdAt).toBe(MAX_KEEP_HOURS * 3600_000)
    expect(vault.entries[0].expiresAt).toBe(null)
  })

  it('an imported diff carries the sender tags plus the local "imported" tag', async () => {
    const vault = useVaultStore()
    window.api.shareImport = async () => ({
      ok: true,
      from: 'alice',
      entry: {
        name: 'x',
        snapshot: PAYLOAD,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600_000,
        tags: ['release']
      }
    })
    const res = await vault.importShared()
    expect(vault.entries.find((e) => e.id === res.id).tags).toEqual(
      expect.arrayContaining(['imported', 'release'])
    )
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

  it('lists own non-favorited diffs in ownActive, and favorited ones in favoritesOwn', async () => {
    const vault = useVaultStore()
    await vault.save('plain', 1, PAYLOAD)
    const favId = await vault.save('starred', 1, PAYLOAD)
    vault.toggleFavorite(favId)
    expect(vault.ownActive.map((e) => e.name)).toEqual(['plain'])
    expect(vault.favoritesOwn.map((e) => e.name)).toEqual(['starred'])
  })

  it('applies user tags to a saved diff, registered in the shared tag registry', async () => {
    const vault = useVaultStore()
    const snippets = useSnippetStore()
    const id = await vault.save('tagged', 1, PAYLOAD, ['work', 'wip'])
    expect(vault.entries.find((e) => e.id === id).tags).toEqual(
      expect.arrayContaining(['work', 'wip'])
    )
    // the tags now exist in the shared (snippet) registry with colors
    expect(snippets.colorOf('work')).toBeTruthy()
  })

  // The format lives on `entry.format` (the row's monogram reads it). Injecting
  // it into `tags` too made a user tag that matched the format indistinguishable
  // from the auto one, so the row dropped it as redundant and said "Untagged".
  it('keeps a user tag that matches the diff format, and leaves an untagged diff untagged', async () => {
    const vault = useVaultStore()
    const jsonDiff = { mode: 'file', left: { name: 'a.json' }, right: { name: 'b.json' } }
    const picked = await vault.save('picked', 1, jsonDiff, ['json'])
    const bare = await vault.save('bare', 1, jsonDiff)
    expect(vault.entries.find((e) => e.id === picked).tags).toEqual(['json'])
    expect(vault.entries.find((e) => e.id === bare).tags).toEqual([])
  })

  it('setTags retags a saved diff in place', async () => {
    const vault = useVaultStore()
    const id = await vault.save('t', 1, PAYLOAD, ['a'])
    vault.setTags(id, ['b', 'c'])
    expect(vault.entries.find((e) => e.id === id).tags).toEqual(['b', 'c'])
  })

  it('setTags keeps the colors picked for tags the registry has never seen', async () => {
    const vault = useVaultStore()
    const snippets = useSnippetStore()
    const id = await vault.save('t', 1, PAYLOAD)
    vault.setTags(id, ['fresh'], { fresh: TAG_PALETTE[3] })
    expect(snippets.colorOf('fresh')).toBe(TAG_PALETTE[3])
  })

  it('requestRetag opens the retag dialog on an entry and its current tags', async () => {
    const vault = useVaultStore()
    const id = await vault.save('t', 1, PAYLOAD, ['a'])
    vault.requestRetag(id)
    expect(vault.pendingRetag).toEqual({ id, name: 't', tags: ['a'] })
    vault.cancelRetag()
    expect(vault.pendingRetag).toBeNull()
  })

  it('requestRetag ignores an id that is no longer in the vault', () => {
    const vault = useVaultStore()
    vault.requestRetag('gone')
    expect(vault.pendingRetag).toBeNull()
  })

  it('auto-tags an imported diff "imported"', async () => {
    const vault = useVaultStore()
    await vault.addShared({
      name: 'from alice',
      payload: PAYLOAD,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
      from: 'alice'
    })
    expect(vault.entries.find((e) => e.from === 'alice').tags).toContain('imported')
  })

  it('migrates a legacy category vault into flat entries (categoryId dropped)', () => {
    const legacy = {
      categories: [{ id: 'c1', name: 'Default', isDefault: true }],
      entries: [
        {
          id: 'old1',
          name: 'legacy diff',
          createdAt: Date.now(),
          expiresAt: Date.now() + 3600_000,
          from: null,
          categoryId: 'c1',
          iv: 'x',
          data: 'y'
        }
      ]
    }
    localStorage.setItem('diffbro.vault', JSON.stringify(legacy))
    setActivePinia(createPinia())
    const vault = useVaultStore()
    expect(vault.entries).toHaveLength(1)
    expect(vault.entries[0].categoryId).toBeUndefined()
    expect(vault.entries[0].tags).toEqual([])
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

  it('the delete confirmation is what actually removes a diff', async () => {
    const vault = useVaultStore()
    const id = await vault.save('victim', 1, PAYLOAD)
    vault.requestDelete(id, 'victim')
    expect(vault.entries).toHaveLength(1) // asking is not doing
    vault.cancelDelete()
    expect(vault.pendingDelete).toBeNull()
    expect(vault.entries).toHaveLength(1)

    vault.requestDelete(id, 'victim')
    vault.confirmDelete()
    expect(vault.entries).toHaveLength(0)
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

  // The quick look-up window is a separate Pinia instance and calls reload() on
  // each summon to see diffs the main window saved meanwhile.
  it('reload() re-reads diffs persisted by another window', async () => {
    const vault = useVaultStore()
    await vault.save('one', 1, PAYLOAD)
    expect(vault.entries).toHaveLength(1)
    // Simulate the main window persisting a second diff to disk.
    const raw = JSON.parse(localStorage.getItem('diffbro.vault'))
    raw.entries.push({ ...raw.entries[0], id: 'other', name: 'two' })
    localStorage.setItem('diffbro.vault', JSON.stringify(raw))
    vault.reload()
    expect(vault.entries.map((e) => e.name)).toEqual(['one', 'two'])
  })

  // Older/partial records must not crash the sidebar filters (unguarded
  // e.tags.some / e.name.toLowerCase).
  it('normalizes an older entry with invalid tags or missing name on load', () => {
    localStorage.setItem(
      'diffbro.vault',
      JSON.stringify({
        entries: [{ id: 'x', iv: 'i', data: 'd', createdAt: 1, expiresAt: null, tags: 'oops' }]
      })
    )
    const vault = useVaultStore()
    expect(vault.entries[0].tags).toEqual([])
    expect(typeof vault.entries[0].name).toBe('string')
  })
})

// One ceiling for kept and sealed both, enforced by sealing.js at each end.
describe('how long a diff lives', () => {
  const HOUR = 3600_000

  it('keeps a local diff for as long as a week', async () => {
    const vault = useVaultStore()
    const id = await vault.save('week long', 168, PAYLOAD)
    const entry = vault.entries.find((e) => e.id === id)
    expect(entry.expiresAt - Date.now()).toBeGreaterThan(167 * HOUR)
    await expect(vault.load(id)).resolves.toEqual(PAYLOAD)
  })

  it('offers a week as the longest option, and nothing beyond it', () => {
    expect(TTL_OPTIONS.map((o) => o.hours)).toEqual([1, 8, 24, 48, 72, 168])
    expect(Math.max(...TTL_OPTIONS.map((o) => o.hours))).toBe(MAX_KEEP_HOURS)
  })

  it('clamps a TTL asked for beyond the ceiling', async () => {
    const vault = useVaultStore()
    const id = await vault.save('too long', 10_000, PAYLOAD)
    const entry = vault.entries.find((e) => e.id === id)
    expect(entry.expiresAt - Date.now()).toBeLessThanOrEqual(MAX_KEEP_HOURS * HOUR + 1000)
  })

  it('sends the expiry the sender chose, not a shorter one of its own', async () => {
    const vault = useVaultStore()
    const id = await vault.save('week long', 168, PAYLOAD)
    const entry = vault.entries.find((e) => e.id === id)
    let sealed = null
    window.api.shareExport = async (e) => ((sealed = e), { ok: true })

    await vault.share(id, 'FP')
    // Both copies die at the same moment — that is the point of sending it.
    expect(sealed.createdAt).toBe(entry.createdAt)
    expect(sealed.expiresAt).toBe(entry.expiresAt)
    expect(sealed.expiresAt - sealed.createdAt).toBeGreaterThan(167 * HOUR)
  })

  it('still sends a short diff on its original clock, so it dies together', async () => {
    const vault = useVaultStore()
    const id = await vault.save('short', 8, PAYLOAD)
    const entry = vault.entries.find((e) => e.id === id)
    let sealed = null
    window.api.shareExport = async (e) => ((sealed = e), { ok: true })

    await vault.share(id, 'FP')
    expect(sealed.createdAt).toBe(entry.createdAt)
    expect(sealed.expiresAt).toBe(entry.expiresAt)
  })

  it('shareDraft seals the chosen week, and the local twin matches it', async () => {
    const vault = useVaultStore()
    let sealed = null
    window.api.shareExport = async (entry) => ((sealed = entry), { ok: true })

    await vault.shareDraft({ name: 'wk', ttlHours: 168, snapshot: PAYLOAD, tags: [] }, 'FP')
    expect(sealed.expiresAt - sealed.createdAt).toBeGreaterThan(167 * HOUR)
    expect(vault.entries[0].expiresAt - Date.now()).toBeGreaterThan(167 * HOUR)
  })
})

// Removing a trusted key does nothing to what has already been sent to it —
// that file is on someone else's machine. The point of the record is that the
// reader can see their exposure at the moment they decide.
describe('sealed recipients', () => {
  const sealsOk = () => (window.api.shareExport = async () => ({ ok: true, to: 'bob' }))

  it('records who a diff was sealed for, and when', async () => {
    const vault = useVaultStore()
    sealsOk()
    const id = await vault.save('quarterly', null, PAYLOAD)
    await vault.share(id, ['FP-ALICE', 'FP-BOB'])

    expect(vault.entries[0].sharedTo.map((r) => r.fp)).toEqual(['FP-ALICE', 'FP-BOB'])
    expect(vault.entries[0].sharedTo[0].at).toBeGreaterThan(0)
  })

  // Cancelling the save dialog writes no file, so it is not a share.
  it('records nothing when the seal was not written', async () => {
    const vault = useVaultStore()
    window.api.shareExport = async () => ({ canceled: true })
    const id = await vault.save('quarterly', null, PAYLOAD)
    await vault.share(id, ['FP-ALICE'])
    expect(vault.entries[0].sharedTo).toEqual([])
  })

  it('re-sharing to the same key updates when, rather than stacking', async () => {
    const vault = useVaultStore()
    sealsOk()
    const id = await vault.save('quarterly', null, PAYLOAD)
    await vault.share(id, ['FP-ALICE'])
    const first = vault.entries[0].sharedTo[0].at
    await vault.share(id, ['FP-ALICE'])

    expect(vault.entries[0].sharedTo).toHaveLength(1)
    expect(vault.entries[0].sharedTo[0].at).toBeGreaterThanOrEqual(first)
  })

  it('answers what a key has been sent, most recent first', async () => {
    const vault = useVaultStore()
    sealsOk()
    const older = await vault.save('older', null, PAYLOAD)
    const newer = await vault.save('newer', null, PAYLOAD)
    await vault.share(older, ['FP-ALICE'])
    vault.entries.find((e) => e.id === older).sharedTo[0].at = 1000
    await vault.share(newer, ['FP-ALICE', 'FP-BOB'])

    expect(vault.sharedWith('FP-ALICE').map((s) => s.name)).toEqual(['newer', 'older'])
    expect(vault.sharedWith('FP-BOB').map((s) => s.name)).toEqual(['newer'])
    expect(vault.sharedWith('FP-NOBODY')).toEqual([])
  })

  // This is a list of who ELSE you sent something to. It is local metadata and
  // must never leave the machine inside a share.
  it('never travels inside the sealed file', async () => {
    const vault = useVaultStore()
    let sealed = null
    window.api.shareExport = async (entry) => ((sealed = entry), { ok: true, to: 'bob' })
    const id = await vault.save('quarterly', null, PAYLOAD)
    await vault.share(id, ['FP-ALICE'])
    await vault.share(id, ['FP-BOB'])

    expect(vault.entries[0].sharedTo).toHaveLength(2)
    expect(JSON.stringify(sealed)).not.toContain('FP-ALICE')
    expect(sealed.sharedTo).toBeUndefined()
  })

  // A share of the CURRENT diff seals first and only then saves the local twin,
  // so the record has to land on the entry that save created.
  it('records a draft share against the local twin it creates', async () => {
    const vault = useVaultStore()
    sealsOk()
    await vault.shareDraft({ name: 'draft', ttlHours: null, snapshot: PAYLOAD }, ['FP-ALICE'])

    expect(vault.entries).toHaveLength(1)
    expect(vault.entries[0].sharedTo.map((r) => r.fp)).toEqual(['FP-ALICE'])
  })

  it('survives a reload, and shrugs off a hand-edited record', async () => {
    const vault = useVaultStore()
    sealsOk()
    const id = await vault.save('quarterly', null, PAYLOAD)
    await vault.share(id, ['FP-ALICE'])

    vault.reload()
    expect(vault.sharedWith('FP-ALICE')).toHaveLength(1)

    vault.entries[0].sharedTo = [{ fp: 42 }, null, { at: 5 }, { fp: 'FP-OK', at: 'soon' }]
    vault.persist()
    vault.reload()
    expect(vault.entries[0].sharedTo).toEqual([{ fp: 'FP-OK', at: 0 }])
  })
})

// The sealed file is already written and gone by the time the local copy is
// attempted, so a vault key that will not unlock must be reported — silently
// keeping no local twin looks identical to a successful share.
describe('shareDraft when the local copy cannot be saved', () => {
  it('reports the sealed file was sent without a local copy', async () => {
    const vault = useVaultStore()
    window.api = {
      shareExport: async () => ({ ok: true, path: '/tmp/out.diffbro' }),
      vaultEncrypt: async () => ({ error: 'vault-key-unavailable' })
    }

    const res = await vault.shareDraft(
      { name: 'draft', ttlHours: 24, snapshot: { mode: 'files' } },
      ['fp1']
    )

    expect(res.ok).toBe(true)
    expect(res.localCopy).toBe(false)
    expect(vault.entries).toHaveLength(0)
  })

  it('says nothing extra when the local twin was saved', async () => {
    const vault = useVaultStore()
    window.api = {
      shareExport: async () => ({ ok: true, path: '/tmp/out.diffbro' }),
      vaultEncrypt: async (plaintext) => ({ iv: 'iv', data: plaintext }),
      vaultDecrypt: async (box) => box.data
    }

    const res = await vault.shareDraft(
      { name: 'draft', ttlHours: 24, snapshot: { mode: 'files' } },
      ['fp1']
    )

    expect(res.ok).toBe(true)
    expect(res.localCopy).toBe(true)
    expect(vault.entries).toHaveLength(1)
  })
})

// The diffs travel decrypted, to be re-sealed under the user's passphrase: the
// vault key never leaves the machine, which is what makes the archive portable.
describe('vaultStore — backup bundle', () => {
  it('carries every kept diff with its payload, name and tags', async () => {
    const vault = useVaultStore()
    await vault.save('kept one', null, PAYLOAD, ['infra'])
    await vault.save('kept two', null, { mode: 'files', left: 'a' })

    const bundle = await vault.fullBundle()
    expect(bundle.diffs).toHaveLength(2)
    expect(bundle.diffs.map((d) => d.name).sort()).toEqual(['kept one', 'kept two'])
    const kept = bundle.diffs.find((d) => d.name === 'kept one')
    expect(kept.payload).toEqual(PAYLOAD)
    expect(kept.tags).toContain('infra')
  })

  // The same rule autoBackup already follows: the reader asked them to die, and
  // restoring one months later would quietly undo that.
  it('leaves expiring diffs out', async () => {
    const vault = useVaultStore()
    await vault.save('permanent', null, PAYLOAD)
    await vault.save('temporary', 1, PAYLOAD)

    const bundle = await vault.fullBundle()
    expect(bundle.diffs.map((d) => d.name)).toEqual(['permanent'])
  })

  it('is empty rather than broken with nothing saved', async () => {
    await expect(useVaultStore().fullBundle()).resolves.toEqual({ diffs: [] })
  })

  it('restores a bundle by re-encrypting each diff under this vault', async () => {
    const vault = useVaultStore()
    await vault.restoreBundle({
      diffs: [{ name: 'from backup', payload: PAYLOAD, tags: ['restored'] }]
    })
    expect(vault.active).toHaveLength(1)
    const [entry] = vault.active
    expect(entry.name).toBe('from backup')
    expect(entry.expiresAt).toBeNull()
    await expect(vault.load(entry.id)).resolves.toEqual(PAYLOAD)
  })

  // A restored bundle is a file off disk — it is not trusted to be well formed.
  it('skips malformed entries instead of throwing', async () => {
    const vault = useVaultStore()
    await vault.restoreBundle({
      diffs: [null, { name: 'no payload' }, { payload: PAYLOAD, name: 'good' }, 'nonsense']
    })
    expect(vault.active.map((e) => e.name)).toEqual(['good'])
  })

  it('treats a bundle with no diffs as a no-op', async () => {
    const vault = useVaultStore()
    await vault.restoreBundle({})
    await vault.restoreBundle(null)
    expect(vault.active).toHaveLength(0)
  })

  it('round-trips a saved diff through bundle and restore', async () => {
    const vault = useVaultStore()
    await vault.save('original', null, PAYLOAD, ['infra'])
    const bundle = await vault.fullBundle()
    vault.entries = []
    await vault.restoreBundle(bundle)
    expect(vault.active).toHaveLength(1)
    await expect(vault.load(vault.active[0].id)).resolves.toEqual(PAYLOAD)
  })
})
