import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../persist'

// Saved diffs are a security-sensitive convenience: content is AES-256-GCM
// encrypted with an install-specific key held by the main process (backed by
// the OS keychain), and every entry auto-expires — default 1 hour, hard cap
// 24 hours. Only the entry name and timestamps are stored in plaintext.
// All crypto runs in the main process (vault:encrypt / vault:decrypt IPC);
// this store never sees the key. Persistence goes through the durable file
// store (persist.js) so saved diffs survive an app reinstall.
export const DEFAULT_TTL_HOURS = 1
export const MAX_TTL_HOURS = 24
export const TTL_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '8 hours', hours: 8 },
  { label: '24 hours', hours: 24 }
]

// The entry's plaintext metadata is bound to the ciphertext as AES-GCM
// additional authenticated data: anyone editing localStorage to, say,
// extend expiresAt just makes the entry undecryptable (and it gets purged).
// categoryId, like the entry name and favorite flag, is plaintext
// organizational metadata and deliberately NOT part of the AAD.
const entryAad = (id, createdAt, expiresAt, from) =>
  [id, createdAt, expiresAt, from ?? ''].join('|')

const IMPORTED_CATEGORY = 'imported'

// Category names are normalized to a single leading capital followed by
// lowercase (e.g. "RELEASE notes" → "Release notes"), so the folder tree reads
// consistently no matter how the name was typed. Empty falls back to "Untitled".
function normalizeCategoryName(raw) {
  const trimmed = (raw || '').trim()
  if (!trimmed) return 'Untitled'
  return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase()
}

// Categories persist independently of the diffs in them: expiry purges a
// diff but never its category. The "Default" category is the non-deletable
// fallback (marked isDefault so it survives rename). A reserved, hidden
// "imported" category holds diffs received from others.
// Parse the persisted blob, tolerating the legacy shape (a bare entries array)
// and anything unreadable (start empty rather than throw at import time).
function parsePersistedVault(raw) {
  if (!raw) return { categories: [], entries: [] }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return { categories: [], entries: parsed }
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    }
  } catch {
    return { categories: [], entries: [] }
  }
}

function readState() {
  const { categories, entries } = parsePersistedVault(loadPersisted('vault'))
  if (!categories.some((c) => c.isDefault)) {
    categories.unshift({ id: crypto.randomUUID(), name: 'Default', isDefault: true })
  }
  const defaultId = categories.find((c) => c.isDefault).id
  // Legacy / imported entries with no category land in Default (own) or the
  // reserved imported bucket (shared-in).
  for (const e of entries) {
    if (!e.categoryId) e.categoryId = e.from ? IMPORTED_CATEGORY : defaultId
  }
  return { categories, entries }
}

export const useVaultStore = defineStore('vault', {
  state: () => ({
    // { id, name, createdAt, expiresAt, categoryId, favorite, iv, data }
    ...readState(),
    // re-render trigger for the expiry countdowns
    now: Date.now(),
    // { type: 'category' | 'entry', id, name } pending delete confirmation.
    pendingDelete: null,
    // Bumps to a category id whenever a diff lands in it, so the sidebar can
    // auto-expand it.
    lastTouchedCategory: null,
    // Set when the main process can't load the vault key (locked keychain,
    // etc). Distinct from a per-entry auth failure: we must NOT purge the
    // entries — the key may come back — so we surface this and hold.
    keyError: null
  }),
  getters: {
    // Favorites float to the top; otherwise insertion order is preserved
    // (stable sort). Favoriting is plaintext metadata, same as the name.
    // expiresAt === null is a "kept" (non-expiring) diff — always active.
    active: (s) =>
      s.entries
        .filter((e) => e.expiresAt === null || e.expiresAt > s.now)
        .slice()
        .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)),
    defaultCategoryId: (s) => s.categories.find((c) => c.isDefault)?.id ?? null,
    // Favorited own diffs are lifted out of their category into a pinned
    // "Favorites" group at the top, so a category never shows its own
    // favorites.
    favoritesOwn() {
      return this.active.filter((e) => !e.from && e.favorite)
    },
    // Own (not shared-in), non-favorited active diffs in one category.
    activeInCategory() {
      return (categoryId) =>
        this.active.filter((e) => !e.from && !e.favorite && e.categoryId === categoryId)
    },
    // Every active own diff filed under a category, favorited ones included — so
    // the delete confirmation can warn that removing the category deletes them.
    diffsInCategory() {
      return (categoryId) => this.active.filter((e) => !e.from && e.categoryId === categoryId)
    },
    // Shared-in diffs are shown in their own "External diffs" section.
    importedActive() {
      return this.active.filter((e) => e.from)
    },
    // Favorited shared-in diffs get their own ★ shelf at the top of the External
    // section — kept separate from your own saved-diff favorites on purpose
    // (they're signed by someone else). Favoriting only pins; it can't extend
    // the sender-bound expiry.
    importedFavorites() {
      return this.importedActive.filter((e) => e.favorite)
    },
    importedOthers() {
      return this.importedActive.filter((e) => !e.favorite)
    },
    // Any category except Default can be deleted. Deleting one also deletes the
    // diffs filed under it (removeCategory); the confirmation warns when it
    // holds any.
    canDeleteCategory() {
      return (id) => {
        const category = this.categories.find((c) => c.id === id)
        return !!category && !category.isDefault
      }
    }
  },
  actions: {
    persist() {
      savePersisted('vault', JSON.stringify({ categories: this.categories, entries: this.entries }))
    },
    tick() {
      this.now = Date.now()
      const before = this.entries.length
      this.entries = this.entries.filter((e) => e.expiresAt === null || e.expiresAt > this.now)
      if (this.entries.length !== before) this.persist()
    },
    // ttlHours === null saves a "kept" diff that never expires (the save dialog's
    // "Secure" toggle off); any number saves an auto-expiring ("secure") diff,
    // capped at 24 h. Shared copies always expire regardless (see share()).
    async save(name, ttlHours, payload, categoryId) {
      let expiresAt = null
      if (ttlHours !== null) {
        const hours = Math.min(Math.max(ttlHours || DEFAULT_TTL_HOURS, 0.1), MAX_TTL_HOURS)
        expiresAt = Date.now() + hours * 3600_000
      }
      return this._add({
        name,
        payload,
        createdAt: Date.now(),
        expiresAt,
        from: null,
        categoryId: categoryId ?? this.defaultCategoryId
      })
    },
    // Entry received from another machine: keep the sender's absolute
    // timestamps so it expires at the same moment everywhere (the 24 h cap
    // was already enforced during signature verification in main).
    async addShared(entry) {
      return this._add({ ...entry, categoryId: IMPORTED_CATEGORY })
    },
    async _add({ name, payload, createdAt, expiresAt, from, categoryId }) {
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
      this.entries.push({
        id,
        name: name || 'Untitled diff',
        createdAt,
        expiresAt,
        from: from ?? null,
        categoryId,
        favorite: false,
        iv,
        data
      })
      if (!from) this.lastTouchedCategory = categoryId
      this.persist()
      return id
    },
    addCategory(name) {
      const id = crypto.randomUUID()
      this.categories.push({ id, name: normalizeCategoryName(name) })
      this.persist()
      return id
    },
    // Refuses only the Default category. Deleting a category also deletes every
    // diff filed under it (favorited ones included) — the confirmation warns
    // when it holds any. Returns whether it deleted.
    removeCategory(id) {
      if (!this.canDeleteCategory(id)) return false
      this.entries = this.entries.filter((e) => e.categoryId !== id)
      this.categories = this.categories.filter((c) => c.id !== id)
      this.persist()
      return true
    },
    // Unified delete-confirmation for categories and individual diffs, so
    // nothing is ever removed silently. type: 'category' | 'entry'.
    requestDelete(type, id, name) {
      this.pendingDelete = { type, id, name }
    },
    confirmDelete() {
      const pending = this.pendingDelete
      this.pendingDelete = null
      if (!pending) return
      if (pending.type === 'category') this.removeCategory(pending.id)
      else this.remove(pending.id)
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
    // Persist a successfully-opened share into the imported-diffs category and
    // hand back the new entry's id so the caller can open it. Shared by both
    // import paths, so their success handling can't drift apart.
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
        // Undecryptable with a valid key: genuine tampered metadata /
        // corruption for THIS entry — drop it (AAD tamper-evidence).
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
