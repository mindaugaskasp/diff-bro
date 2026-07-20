import { defineStore } from 'pinia'

// Snippets are a personal, non-expiring text library — encrypted at rest
// with the same install-specific vault key as saved diffs (vault:encrypt /
// vault:decrypt IPC; the key never enters this store), but with no
// expiresAt: unlike a saved diff, a snippet is meant to stick around until
// you delete it. Category names are plaintext organizational metadata,
// same trust level as a saved diff's `name`.
const STORAGE_KEY = 'diffbro.snippets'
const DEFAULT_CATEGORY_NAME = 'Default'

// The "Default" category always exists as the fallback home for new
// snippets and can never be deleted, so every install is guaranteed a
// place to put a snippet. It's marked with `isDefault` rather than a
// reserved id so it survives export/import and rename.
function ensureDefault(state) {
  if (!state.categories.some((c) => c.isDefault)) {
    state.categories.unshift({
      id: crypto.randomUUID(),
      name: DEFAULT_CATEGORY_NAME,
      isDefault: true
    })
  }
  return state
}

function readState() {
  const raw = localStorage.getItem(STORAGE_KEY)
  let state = { categories: [], entries: [] }
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw)
      state = {
        categories: Array.isArray(parsed?.categories) ? parsed.categories : [],
        entries: Array.isArray(parsed?.entries) ? parsed.entries : []
      }
    } catch {
      state = { categories: [], entries: [] }
    }
  }
  ensureDefault(state)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  return state
}

// Binds each snippet's ciphertext to its id/category/creation time, same
// tamper-binding pattern as vaultStore's entryAad.
const entryAad = (id, categoryId, createdAt) => [id, categoryId, createdAt].join('|')

const IMPORT_ERRORS = {
  'not-a-snippet-file': 'That file is not a Diff Bro snippets export.',
  'wrong-passphrase': 'Wrong passphrase, or the file is corrupted.',
  'bad-signature': 'Signature check failed — the file was modified or corrupted.',
  corrupted: 'The file could not be read after decryption.'
}

export const useSnippetStore = defineStore('snippets', {
  state: () => ({
    ...readState(),
    // { categoryId } for a single category, or { categoryId: 'all' } — null
    // when the export passphrase dialog is closed.
    pendingExport: null,
    pendingImport: false,
    // { id: null } for a new snippet, or { id } to edit an existing one —
    // null when the editor dialog is closed.
    editingSnippet: null,
    // { type: 'category' | 'snippet', id, name } while a delete confirmation
    // is open — null otherwise.
    pendingDelete: null,
    // Bumps to a category id whenever a snippet lands in it, so the sidebar
    // can auto-expand that category.
    lastTouchedCategory: null
  }),
  getters: {
    // Favorited snippets are lifted out into the pinned "Favorites" group at
    // the top, so a category only lists its non-favorited snippets.
    inCategory: (s) => (categoryId) =>
      s.entries.filter((e) => e.categoryId === categoryId && !e.favorite),
    // All favorited snippets across every category, for the pinned
    // "Favorites" group at the top of the sidebar.
    favorites: (s) => s.entries.filter((e) => e.favorite),
    defaultCategoryId: (s) => s.categories.find((c) => c.isDefault)?.id ?? null,
    // Deletable only if it is not Default and lists no (non-favorited)
    // snippets. Favorited stragglers move to Default on delete (see
    // removeCategory), so they don't block it.
    canDeleteCategory() {
      return (id) => {
        const category = this.categories.find((c) => c.id === id)
        if (!category || category.isDefault) return false
        return !this.inCategory(id).length
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
    addCategory(name) {
      const id = crypto.randomUUID()
      this.categories.push({ id, name: (name || 'Untitled').trim() || 'Untitled' })
      this.persist()
      return id
    },
    // Opens the snippet editor prefilled from a Tools dialog's output.
    startNewSnippetFrom(content, language) {
      this.editingSnippet = {
        id: null,
        categoryId: this.defaultCategoryId,
        initialContent: content,
        initialLanguage: language || 'auto'
      }
    },
    renameCategory(id, name) {
      const category = this.categories.find((c) => c.id === id)
      if (category && name.trim()) category.name = name.trim()
      this.persist()
    },
    // Refuses to delete the Default category or any non-empty one (defense
    // in depth — the UI also gates this). Returns whether it deleted.
    removeCategory(id) {
      if (!this.canDeleteCategory(id)) return false
      // Favorited stragglers (shown in the Favorites group, not the category
      // list) fall back to Default so they never point at a deleted category.
      const def = this.defaultCategoryId
      for (const e of this.entries) if (e.categoryId === id) e.categoryId = def
      this.categories = this.categories.filter((c) => c.id !== id)
      this.persist()
      return true
    },
    // language is the chosen syntax for highlighting ('auto' lets the editor
    // detect it); plaintext metadata, not part of the AAD.
    async add(categoryId, name, content, language) {
      const id = crypto.randomUUID()
      const createdAt = Date.now()
      const { iv, data } = await window.api.vaultEncrypt(
        content,
        entryAad(id, categoryId, createdAt)
      )
      this.entries.push({
        id,
        categoryId,
        name: (name || 'Untitled snippet').trim() || 'Untitled snippet',
        createdAt,
        language: language || 'auto',
        favorite: false,
        iv,
        data
      })
      this.lastTouchedCategory = categoryId
      this.persist()
      return id
    },
    async load(id) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return null
      const content = await window.api.vaultDecrypt(
        { iv: entry.iv, data: entry.data },
        entryAad(entry.id, entry.categoryId, entry.createdAt)
      )
      if (content === null) {
        // Undecryptable (tampered metadata / rotated key / corrupted) — drop it.
        this.remove(id)
        return null
      }
      return content
    },
    // categoryId is optional — passing a different one moves the snippet to
    // that category (which also re-binds the AAD, since categoryId is part
    // of it).
    async update(id, name, content, categoryId, language) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return
      const newCategoryId = categoryId ?? entry.categoryId
      const { iv, data } = await window.api.vaultEncrypt(
        content,
        entryAad(entry.id, newCategoryId, entry.createdAt)
      )
      entry.categoryId = newCategoryId
      entry.name = (name || entry.name).trim() || entry.name
      if (language) entry.language = language
      entry.iv = iv
      entry.data = data
      this.persist()
    },
    remove(id) {
      this.entries = this.entries.filter((e) => e.id !== id)
      this.persist()
    },
    // --- delete confirmation flow ---
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
    toggleFavorite(id) {
      const entry = this.entries.find((e) => e.id === id)
      if (entry) {
        entry.favorite = !entry.favorite
        this.persist()
      }
    },
    // --- export / import ---
    // ALL snippets in the category (favorited ones are only lifted out for
    // display, not for export), with their chosen language.
    async _bundleCategory(category) {
      const snippets = []
      for (const entry of this.entries.filter((e) => e.categoryId === category.id)) {
        const content = await this.load(entry.id)
        if (content !== null) {
          snippets.push({ name: entry.name, content, language: entry.language ?? 'auto' })
        }
      }
      return { name: category.name, snippets }
    },
    // Full plaintext bundle of the whole library, for the config backup.
    async fullBundle() {
      const categories = []
      for (const category of this.categories) categories.push(await this._bundleCategory(category))
      return { categories }
    },
    // Merge an in-memory bundle back in (used by config restore). Categories
    // are matched by name; snippets are appended.
    async restoreBundle(bundle) {
      for (const category of bundle?.categories ?? []) {
        let categoryId = this.categories.find((c) => c.name === category.name)?.id
        if (!categoryId) categoryId = this.addCategory(category.name)
        for (const snippet of category.snippets ?? []) {
          await this.add(categoryId, snippet.name, snippet.content, snippet.language)
        }
      }
    },
    async exportCategory(categoryId, passphrase) {
      const category = this.categories.find((c) => c.id === categoryId)
      if (!category) return { error: 'missing' }
      const bundle = { categories: [await this._bundleCategory(category)] }
      return window.api.exportSnippets(bundle, passphrase, category.name)
    },
    async exportAll(passphrase) {
      const categories = []
      for (const category of this.categories) categories.push(await this._bundleCategory(category))
      return window.api.exportSnippets({ categories }, passphrase, 'diffbro-snippets')
    },
    async importSnippets(passphrase) {
      const res = await window.api.importSnippets(passphrase)
      if (!res.ok) {
        if (!res.canceled) res.message = IMPORT_ERRORS[res.error] ?? 'Import failed.'
        return res
      }
      for (const category of res.bundle?.categories ?? []) {
        let categoryId = this.categories.find((c) => c.name === category.name)?.id
        if (!categoryId) categoryId = this.addCategory(category.name)
        for (const snippet of category.snippets ?? []) {
          await this.add(categoryId, snippet.name, snippet.content, snippet.language)
        }
      }
      return res
    }
  }
})
