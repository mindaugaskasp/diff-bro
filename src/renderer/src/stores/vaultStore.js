import { defineStore } from 'pinia'

// Saved diffs are a security-sensitive convenience: content is AES-256-GCM
// encrypted with an install-specific key held by the main process (backed by
// the OS keychain), and every entry auto-expires — default 1 hour, hard cap
// 24 hours. Only the entry name and timestamps are stored in plaintext.
// All crypto runs in the main process (vault:encrypt / vault:decrypt IPC);
// this store never sees the key.
const STORAGE_KEY = 'diffbro.vault'
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

// Categories persist independently of the diffs in them: expiry purges a
// diff but never its category. The "Default" category is the non-deletable
// fallback (marked isDefault so it survives rename). A reserved, hidden
// "imported" category holds diffs received from others.
function readState() {
  const raw = localStorage.getItem(STORAGE_KEY)
  let categories = []
  let entries = []
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        entries = parsed // legacy shape: a bare entries array
      } else {
        categories = Array.isArray(parsed.categories) ? parsed.categories : []
        entries = Array.isArray(parsed.entries) ? parsed.entries : []
      }
    } catch {
      // keep empty defaults
    }
  }
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
    // { id, name } of a category pending delete confirmation, or null
    pendingDeleteCategory: null
  }),
  getters: {
    // Favorites float to the top; otherwise insertion order is preserved
    // (stable sort). Favoriting is plaintext metadata, same as the name.
    active: (s) =>
      s.entries
        .filter((e) => e.expiresAt > s.now)
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
    // Shared-in diffs are shown in their own flat "External diffs" section.
    importedActive() {
      return this.active.filter((e) => e.from)
    },
    // Deletable only if it is not Default and shows no diffs of its own
    // (favorited diffs have moved to the Favorites group and don't block
    // deletion; removeCategory reassigns any stragglers to Default).
    canDeleteCategory() {
      return (id) => {
        const category = this.categories.find((c) => c.id === id)
        if (!category || category.isDefault) return false
        return !this.activeInCategory(id).length
      }
    }
  },
  actions: {
    persist() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ categories: this.categories, entries: this.entries })
      )
    },
    tick() {
      this.now = Date.now()
      const before = this.entries.length
      this.entries = this.entries.filter((e) => e.expiresAt > this.now)
      if (this.entries.length !== before) this.persist()
    },
    async save(name, ttlHours, payload, categoryId) {
      const hours = Math.min(Math.max(ttlHours || DEFAULT_TTL_HOURS, 0.1), MAX_TTL_HOURS)
      return this._add(
        name,
        payload,
        Date.now(),
        Date.now() + hours * 3600_000,
        null,
        categoryId ?? this.defaultCategoryId
      )
    },
    // Entry received from another machine: keep the sender's absolute
    // timestamps so it expires at the same moment everywhere (the 24 h cap
    // was already enforced during signature verification in main).
    async addShared(name, payload, createdAt, expiresAt, from) {
      await this._add(name, payload, createdAt, expiresAt, from, IMPORTED_CATEGORY)
    },
    async _add(name, payload, createdAt, expiresAt, from, categoryId) {
      const id = crypto.randomUUID()
      const { iv, data } = await window.api.vaultEncrypt(
        JSON.stringify(payload),
        entryAad(id, createdAt, expiresAt, from)
      )
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
      this.persist()
      return id
    },
    addCategory(name) {
      const id = crypto.randomUUID()
      this.categories.push({ id, name: (name || 'Untitled').trim() || 'Untitled' })
      this.persist()
      return id
    },
    renameCategory(id, name) {
      const category = this.categories.find((c) => c.id === id)
      if (category && name.trim()) {
        category.name = name.trim()
        this.persist()
      }
    },
    // Refuses the Default category and any category still holding active
    // diffs (defense in depth — the UI gates this too). Returns whether it
    // deleted.
    removeCategory(id) {
      if (!this.canDeleteCategory(id)) return false
      // Any favorited stragglers still tagged to this category (they live in
      // the Favorites group, not the category list) fall back to Default so
      // they never point at a deleted category. categoryId is plaintext
      // metadata (not in the AAD), so this needs no re-encryption.
      const def = this.defaultCategoryId
      for (const e of this.entries) if (e.categoryId === id) e.categoryId = def
      this.categories = this.categories.filter((c) => c.id !== id)
      this.persist()
      return true
    },
    requestDeleteCategory(id, name) {
      this.pendingDeleteCategory = { id, name }
    },
    confirmDeleteCategory() {
      const pending = this.pendingDeleteCategory
      this.pendingDeleteCategory = null
      if (pending) this.removeCategory(pending.id)
    },
    cancelDeleteCategory() {
      this.pendingDeleteCategory = null
    },
    // Decrypt an entry and hand it to the main process, which signs it and
    // seals it for the chosen recipient.
    async share(id, recipientFp) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return { error: 'missing' }
      const payload = await this.load(id)
      if (!payload) return { error: 'missing' }
      return window.api.shareExport(
        {
          name: entry.name,
          createdAt: entry.createdAt,
          expiresAt: entry.expiresAt,
          snapshot: payload
        },
        recipientFp
      )
    },
    async importShared() {
      const res = await window.api.shareImport()
      if (res.ok) {
        const { name, snapshot, createdAt, expiresAt } = res.entry
        await this.addShared(name, snapshot, createdAt, expiresAt, res.from)
      }
      return res
    },
    async load(id) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry || entry.expiresAt <= Date.now()) return null
      const plaintext = await window.api.vaultDecrypt(
        { iv: entry.iv, data: entry.data },
        entryAad(entry.id, entry.createdAt, entry.expiresAt, entry.from)
      )
      if (plaintext === null) {
        // Undecryptable (tampered metadata / key rotated / corrupted) —
        // drop the entry.
        this.remove(id)
        return null
      }
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
