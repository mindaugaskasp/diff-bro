import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../persist'
import { useSnippetStore } from './snippetStore'

// Saved diffs are a security-sensitive convenience: content is AES-256-GCM
// encrypted with an install-specific key held by the main process (backed by
// the OS keychain), and every entry auto-expires unless saved as "kept" —
// default 1 hour, hard cap 24 hours. Only the entry name, tags and timestamps
// are plaintext. All crypto runs in the main process (vault:encrypt /
// vault:decrypt IPC); this store never sees the key. Organization is by TAGS,
// drawn from the SAME registry as snippets (useSnippetStore) — one tag namespace
// across the app. Tags are plaintext metadata, deliberately NOT in the AAD.
export const DEFAULT_TTL_HOURS = 1
export const MAX_TTL_HOURS = 24
export const TTL_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '8 hours', hours: 8 },
  { label: '24 hours', hours: 24 }
]

// The entry's plaintext metadata is bound to the ciphertext as AES-GCM
// additional authenticated data: editing localStorage to, say, extend expiresAt
// just makes the entry undecryptable (and it gets purged). Name/tags/favorite
// are plaintext organizational metadata and deliberately NOT part of the AAD.
const entryAad = (id, createdAt, expiresAt, from) =>
  [id, createdAt, expiresAt, from ?? ''].join('|')

// Map a diff to a format tag from its files' extensions (both sides must agree,
// or one side is enough) — so a JSON comparison is auto-tagged "json", etc.
// Plain text / unknown yields no tag.
const EXT_TAG = { yml: 'yaml', htm: 'html', md: 'markdown', xlsx: 'excel', txt: null, text: null }
export function diffFormatTag(payload) {
  const extOf = (f) => /\.([a-z0-9]+)$/i.exec(f?.name ?? '')?.[1]?.toLowerCase() ?? null
  const raw = extOf(payload?.left) ?? extOf(payload?.right)
  if (!raw) return null
  const tag = raw in EXT_TAG ? EXT_TAG[raw] : raw
  return tag || null
}

// Parse the persisted blob. Tolerates the legacy category shape (drops
// categoryId; category names are intentionally not migrated to tags) and the
// even older bare-array shape. Anything unreadable starts empty.
function readEntries() {
  const raw = loadPersisted('vault')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : []
    return list.map((e) => {
      const clean = { ...e, tags: Array.isArray(e.tags) ? e.tags : [] }
      delete clean.categoryId // categories are gone; drop the stale field
      return clean
    })
  } catch {
    return []
  }
}

export const useVaultStore = defineStore('vault', {
  state: () => ({
    // { id, name, createdAt, expiresAt, from, favorite, tags:[name], iv, data }
    entries: readEntries(),
    // re-render trigger for the expiry countdowns
    now: Date.now(),
    // { id, name } pending diff-delete confirmation.
    pendingDelete: null,
    // Set when the main process can't load the vault key (locked keychain,
    // etc). Distinct from a per-entry auth failure: we must NOT purge the
    // entries — the key may come back — so we surface this and hold.
    keyError: null
  }),
  getters: {
    // Favorites float to the top; otherwise insertion order is preserved (stable
    // sort). expiresAt === null is a "kept" (non-expiring) diff — always active.
    active: (s) =>
      s.entries
        .filter((e) => e.expiresAt === null || e.expiresAt > s.now)
        .slice()
        .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)),
    // Your own (not shared-in) favorited diffs — pinned above the rest.
    favoritesOwn() {
      return this.active.filter((e) => !e.from && e.favorite)
    },
    // Your own, non-favorited active diffs.
    ownActive() {
      return this.active.filter((e) => !e.from && !e.favorite)
    },
    // Shared-in diffs (each signed by its sender), shown in their own section.
    importedActive() {
      return this.active.filter((e) => e.from)
    },
    importedFavorites() {
      return this.importedActive.filter((e) => e.favorite)
    },
    importedOthers() {
      return this.importedActive.filter((e) => !e.favorite)
    }
  },
  actions: {
    persist() {
      savePersisted('vault', JSON.stringify({ entries: this.entries }))
    },
    tick() {
      this.now = Date.now()
      const before = this.entries.length
      this.entries = this.entries.filter((e) => e.expiresAt === null || e.expiresAt > this.now)
      if (this.entries.length !== before) this.persist()
    },
    // ttlHours === null saves a "kept" diff that never expires (the save dialog's
    // "Secure" toggle off); any number gives an auto-expiring diff, capped at
    // 24 h. `tags` are user tags; the diff's detected format is auto-added.
    async save(name, ttlHours, payload, tags = []) {
      let expiresAt = null
      if (ttlHours !== null) {
        const hours = Math.min(Math.max(ttlHours || DEFAULT_TTL_HOURS, 0.1), MAX_TTL_HOURS)
        expiresAt = Date.now() + hours * 3600_000
      }
      const auto = diffFormatTag(payload)
      return this._add({
        name,
        payload,
        createdAt: Date.now(),
        expiresAt,
        from: null,
        tags: auto ? [auto, ...tags] : tags
      })
    },
    // Entry received from another machine: keep the sender's absolute timestamps
    // so it expires at the same moment everywhere, and auto-tag it "imported".
    async addShared(entry) {
      return this._add({ ...entry, tags: ['imported', ...(entry.tags || [])] })
    },
    async _add({ name, payload, createdAt, expiresAt, from, tags = [] }) {
      const id = crypto.randomUUID()
      const box = await window.api.vaultEncrypt(
        JSON.stringify(payload),
        entryAad(id, createdAt, expiresAt, from)
      )
      // Key unavailable — don't persist a half-formed (undecryptable) entry.
      if (box?.error) {
        this.keyError = box.error
        return null
      }
      const { iv, data } = box
      // Tags register into the shared (snippet) tag registry so colors/namespace
      // are consistent across diffs and snippets.
      const applied = useSnippetStore().registerTags(tags)
      this.entries.push({
        id,
        name: name || 'Untitled diff',
        createdAt,
        expiresAt,
        from: from ?? null,
        favorite: false,
        tags: applied,
        iv,
        data
      })
      this.persist()
      return id
    },
    // Retag a saved diff in place (plaintext metadata — no re-encryption).
    setTags(id, tags) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return
      entry.tags = useSnippetStore().registerTags(tags)
      this.persist()
    },
    requestDelete(id, name) {
      this.pendingDelete = { id, name }
    },
    confirmDelete() {
      const pending = this.pendingDelete
      this.pendingDelete = null
      if (pending) this.remove(pending.id)
    },
    cancelDelete() {
      this.pendingDelete = null
    },
    // Decrypt an entry and hand it to the main process, which signs it and
    // seals it for the chosen recipient.
    async share(id, recipientFp) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return { error: 'missing' }
      const payload = await this.load(id)
      if (!payload) return { error: 'missing' }
      // Sealed shares MUST carry a finite, ≤24 h expiry (sealing.js enforces it
      // both signing and opening). A kept (non-expiring) diff therefore gets a
      // fresh 24 h window for its shared copy — the local original is untouched.
      const now = Date.now()
      const createdAt = entry.expiresAt === null ? now : entry.createdAt
      const expiresAt = entry.expiresAt ?? now + MAX_TTL_HOURS * 3600_000
      return window.api.shareExport(
        { name: entry.name, createdAt, expiresAt, snapshot: payload },
        recipientFp
      )
    },
    async importShared() {
      return this._ingestShared(await window.api.shareImport())
    },
    // Drag-drop variant: import a sealed .diffbro by path (see useFileDrop).
    async importSharedFromPath(path) {
      return this._ingestShared(await window.api.shareImportPath(path))
    },
    // Persist a successfully-opened share and hand back the new entry's id so the
    // caller can open it. Shared by both import paths so they can't drift apart.
    async _ingestShared(res) {
      if (!res.ok) return res
      const { name, snapshot, createdAt, expiresAt } = res.entry
      const id = await this.addShared({
        name,
        payload: snapshot,
        createdAt,
        expiresAt,
        from: res.from
      })
      return { ...res, id }
    },
    async load(id) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry || (entry.expiresAt !== null && entry.expiresAt <= Date.now())) return null
      const plaintext = await window.api.vaultDecrypt(
        { iv: entry.iv, data: entry.data },
        entryAad(entry.id, entry.createdAt, entry.expiresAt, entry.from)
      )
      // Key couldn't be loaded (locked keychain, etc): keep every entry and
      // surface the problem — the key may come back. NEVER purge here.
      if (plaintext && typeof plaintext === 'object' && plaintext.error) {
        this.keyError = plaintext.error
        return null
      }
      if (plaintext === null) {
        // Undecryptable with a valid key: genuine tampered metadata / corruption
        // for THIS entry — drop it (AAD tamper-evidence).
        this.remove(id)
        return null
      }
      this.keyError = null
      try {
        return JSON.parse(plaintext)
      } catch {
        this.remove(id)
        return null
      }
    },
    remove(id) {
      this.entries = this.entries.filter((e) => e.id !== id)
      this.persist()
    },
    toggleFavorite(id) {
      const entry = this.entries.find((e) => e.id === id)
      if (entry) {
        entry.favorite = !entry.favorite
        this.persist()
      }
    }
  }
})
