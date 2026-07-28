import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../persist'
import { detectSnippetLanguage } from '../utils/detectLanguage'

// Snippets are a personal, non-expiring text library — encrypted at rest with
// the same install-specific vault key as saved diffs (vault:encrypt /
// vault:decrypt IPC; the key never enters this store). Organization is by
// TAGS: each snippet carries up to MAX_TAGS color-coded tags; one with no tags
// lives under the permanent "Default" catch-all. Tags are plaintext
// organizational metadata, same trust level as a snippet's name — deliberately
// NOT part of the AAD, so retagging never re-encrypts. Persistence goes through
// the durable file store (persist.js) so snippets survive an app reinstall.

// Predefined 20-color palette, tuned to read on both themes. A new tag takes
// the next unused color; past 20 tags colors cycle.
export const TAG_PALETTE = [
  '#4c8dff',
  '#39c5cf',
  '#3fb950',
  '#56d364',
  '#d29922',
  '#e0823d',
  '#f85149',
  '#db61a2',
  '#a371f7',
  '#6cb6ff',
  '#2da44e',
  '#e3b341',
  '#ff7b72',
  '#bc8cff',
  '#76e3ea',
  '#f0883e',
  '#ffa8cc',
  '#8957e5',
  '#cf222e',
  '#8b949e'
]
// Per-entry tag cap. Tags organize BOTH diffs and snippets now (categories are
// gone) and one slot is often the auto-added format tag, so this is generous.
export const MAX_TAGS = 20

export const cleanTag = (name) =>
  String(name ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 40)
const cleanName = (name, fallback = 'Untitled snippet') => String(name ?? '').trim() || fallback

// Next unused palette color; cycles once every color is taken.
function nextColor(tags) {
  const used = new Set(Object.values(tags).map((t) => t.color))
  return (
    TAG_PALETTE.find((c) => !used.has(c)) ??
    TAG_PALETTE[Object.keys(tags).length % TAG_PALETTE.length]
  )
}
// Monotonic recency rank — higher is more recent, so the shelf shows new /
// just-used tags first. Derived from stored ranks so it survives a reload.
function nextRank(tags) {
  const ranks = Object.values(tags).map((t) => t.rank)
  return (ranks.length ? Math.max(...ranks) : 0) + 1
}

// Migrate the persisted blob to the tags shape. Old shape is
// { categories:[{id,name,isDefault}], entries:[{...,categoryId}] }. Crucially,
// the AAD stays `[id, aadSalt, createdAt]` with aadSalt = the entry's original
// categoryId, so existing ciphertext still decrypts — this migration only
// reshapes metadata and never touches (or risks) the encrypted content.
const isTagShape = (parsed) =>
  !!parsed && !!parsed.tags && Array.isArray(parsed.entries) && !parsed.categories

// Every non-default category becomes a tag of the same name.
function tagsFromCategories(categories) {
  const tags = {}
  for (const c of categories) {
    if (c.isDefault) continue
    const n = cleanTag(c.name)
    if (n && !tags[n]) tags[n] = { color: nextColor(tags), rank: nextRank(tags) }
  }
  return tags
}

// Harden a persisted entry against older/partial shapes: guarantee `name` is a
// string and `tags` an array of strings, so the sidebar's unguarded field access
// (entry.tags.some / entry.name.toLowerCase / …) can never throw on old data.
// Name/tags aren't part of the AAD, so this is free metadata — decryption is
// unaffected.
function normalizeEntry(e) {
  return {
    ...e,
    name: typeof e?.name === 'string' ? e.name : String(e?.name ?? 'Untitled snippet'),
    tags: Array.isArray(e?.tags) ? e.tags.filter((t) => typeof t === 'string') : []
  }
}

function migrate(parsed) {
  if (isTagShape(parsed)) {
    return {
      tags: typeof parsed.tags === 'object' && parsed.tags ? parsed.tags : {},
      entries: (Array.isArray(parsed.entries) ? parsed.entries : []).map(normalizeEntry)
    }
  }
  const categories = Array.isArray(parsed?.categories) ? parsed.categories : []
  const catById = new Map(categories.map((c) => [c.id, c]))
  const entries = (Array.isArray(parsed?.entries) ? parsed.entries : []).map((e) => {
    const cat = catById.get(e.categoryId)
    const tagName = cat && !cat.isDefault ? cleanTag(cat.name) : null
    const { categoryId, ...rest } = e
    return normalizeEntry({ ...rest, aadSalt: categoryId, tags: tagName ? [tagName] : [] })
  })
  return { tags: tagsFromCategories(categories), entries }
}

function readState() {
  const raw = loadPersisted('snippets')
  let parsed = null
  if (raw != null) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }
  const state = migrate(parsed)
  savePersisted('snippets', JSON.stringify(state)) // write the migrated shape back
  return state
}

// Binds each snippet's ciphertext to immutable per-snippet values (id + a
// stable salt + creation time). aadSalt is the old categoryId on migrated
// snippets and a fresh UUID on new ones — either way it never changes, so tags
// stay free metadata.
const entryAad = (id, aadSalt, createdAt) => [id, aadSalt, createdAt].join('|')

// Seeded once into a brand-new, empty library so a first-time user meets the
// snippet feature with something real: a Mermaid diagram that both renders in
// the preview and describes what snippets do. It goes through the normal add()
// path, so it is encrypted at rest like any other snippet and can be edited or
// deleted freely.
export const EXAMPLE_SNIPPET = {
  name: 'Example — Mermaid diagram',
  language: 'mermaid',
  tags: ['example'],
  content: `flowchart TD
    A[New snippet] --> B{Syntax?}
    B -- Mermaid --> C[Live diagram preview]
    B -- Anything else --> D[Syntax-highlighted text]
    C --> E[Expand for a zoomable view]
    C --> F[Encrypted at rest, like every snippet]
    D --> F`
}

// A snippet's effective syntax. Content is encrypted at rest, so the sidebar
// can't re-detect it — `detected` is recorded whenever the content is written
// and stands in for a snippet left on 'auto'. Entries saved before this field
// existed simply read as plaintext until their next save.
/**
 * @param {import('../types').SnippetEntry} entry
 * @returns {string} Monaco language id the snippet resolves to
 */
export const languageOf = (entry) =>
  entry?.language && entry.language !== 'auto' ? entry.language : (entry?.detected ?? 'plaintext')

// The format a snippet resolves to, as a tag name — its explicit language, else
// the auto-detected one. Plaintext/unknown yields no tag. Applied automatically
// on save so every snippet is findable by its format (a JSON snippet gets a
// "json" tag, etc.).
export function formatTagFor(language, content) {
  const lang = language && language !== 'auto' ? language : detectSnippetLanguage(content)
  return lang && lang !== 'plaintext' ? lang : null
}

const IMPORT_ERRORS = {
  'not-a-snippet-file': 'That file is not a Diff Bro snippets export.',
  'wrong-passphrase': 'Wrong passphrase, or the file is corrupted.',
  'bad-signature': 'Signature check failed — the file was modified or corrupted.',
  corrupted: 'The file could not be read after decryption.',
  malformed: 'That snippets file is not shaped like a valid export and was rejected.',
  'too-large': 'That snippets file exceeds the allowed size limits and was rejected.'
}

export const useSnippetStore = defineStore('snippets', {
  state: () => ({
    // tags: { name: { color, rank } };  entries: [{ id, aadSalt, name,
    // createdAt, language, favorite, tags:[name], iv, data }]
    ...readState(),
    // { all: true } to export everything, { tag } for one tag ('' = Default) —
    // null when the export passphrase dialog is closed.
    pendingExport: null,
    pendingImport: false,
    // { id: null, ... } for a new snippet, or { id } to edit — null when closed.
    editingSnippet: null,
    // { type: 'snippet' | 'tag', id, name } while a delete confirmation is open.
    pendingDelete: null,
    // Set when the vault key can't be loaded — surfaced, never a reason to drop
    // snippets (which, unlike diffs, don't expire and can't be re-fetched).
    keyError: null
  }),
  getters: {
    // Both shelves are ordered newest-created-first, so the freshest snippet is
    // always at the top of its shelf.
    favorites: (s) => s.entries.filter((e) => e.favorite).sort((a, b) => b.createdAt - a.createdAt),
    // Non-favorited snippets, newest-created first (favorites float to their own
    // shelf in the UI).
    listed: (s) => s.entries.filter((e) => !e.favorite).sort((a, b) => b.createdAt - a.createdAt),
    // Tags actually in use, most-recent first, with usage counts. Tags with no
    // snippets (e.g. created then abandoned in the editor) stay in the registry
    // — reusing their color — but don't clutter the shelf.
    tagList: (s) => {
      const counts = {}
      for (const e of s.entries) for (const t of e.tags) counts[t] = (counts[t] || 0) + 1
      return Object.entries(s.tags)
        .filter(([name]) => counts[name])
        .map(([name, { color, rank }]) => ({ name, color, rank, count: counts[name] }))
        .sort((a, b) => b.rank - a.rank)
    },
    // How many snippets carry no tags (the Default catch-all).
    defaultCount: (s) => s.entries.filter((e) => !e.tags.length).length,
    colorOf: (s) => (name) => s.tags[cleanTag(name)]?.color ?? null
  },
  actions: {
    persist() {
      savePersisted('snippets', JSON.stringify({ tags: this.tags, entries: this.entries }))
    },
    // Re-read the persisted library from disk. The quick look-up runs in a
    // separate window (its own Pinia instance), so it calls this on each summon
    // to pick up snippets the main window added or edited meanwhile.
    reload() {
      const s = readState()
      this.tags = s.tags
      this.entries = s.entries
    },
    // Register any missing tags (using the caller's chosen color when given,
    // else the next palette color — this is where a tag typed in the editor is
    // FIRST persisted, only when the snippet is saved), touch used ones to
    // "now", and return the cleaned, de-duplicated, capped applied list.
    registerTags(names, colors = {}) {
      const out = []
      for (const raw of names ?? []) {
        const n = cleanTag(raw)
        if (!n || out.includes(n) || out.length >= MAX_TAGS) continue
        if (!this.tags[n]) {
          const c = TAG_PALETTE.includes(colors[n]) ? colors[n] : nextColor(this.tags)
          this.tags[n] = { color: c, rank: nextRank(this.tags) }
        } else this.tags[n].rank = nextRank(this.tags)
        out.push(n)
      }
      return out
    },
    // Add the starter snippet. Returns its id, or null if the vault key wasn't
    // available (so the caller can leave the first-run flag unset and retry).
    async seedExample() {
      return this.add({ ...EXAMPLE_SNIPPET })
    },
    // Opens the snippet editor prefilled from a Tools dialog's "Add to Snippets".
    startNewSnippetFrom(content, language) {
      this.editingSnippet = {
        id: null,
        initialContent: content,
        initialLanguage: language || 'auto',
        initialTags: []
      }
    },
    async add({ name, content, language, tags = [], tagColors = {} }) {
      const id = crypto.randomUUID()
      const createdAt = Date.now()
      const aadSalt = crypto.randomUUID()
      const box = await window.api.vaultEncrypt(content, entryAad(id, aadSalt, createdAt))
      // Key unavailable — don't persist an undecryptable snippet.
      if (box?.error) {
        this.keyError = box.error
        return null
      }
      const ft = formatTagFor(language, content)
      const applied = this.registerTags(ft ? [ft, ...tags] : tags, tagColors)
      this.entries.push({
        id,
        aadSalt,
        name: cleanName(name),
        createdAt,
        language: language || 'auto',
        detected: detectSnippetLanguage(content),
        favorite: false,
        tags: applied,
        iv: box.iv,
        data: box.data
      })
      this.persist()
      return id
    },
    async load(id) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return null
      const content = await window.api.vaultDecrypt(
        { iv: entry.iv, data: entry.data },
        entryAad(entry.id, entry.aadSalt, entry.createdAt)
      )
      // Key couldn't be loaded — keep the snippet, surface the problem.
      if (content && typeof content === 'object' && content.error) {
        this.keyError = content.error
        return null
      }
      if (content === null) {
        // Undecryptable with a valid key: genuine tamper/corruption — drop it.
        this.remove(id)
        return null
      }
      this.keyError = null
      // Backfill for snippets saved before `detected` existed: this is the one
      // place their plaintext is in hand, and the hover preview decrypts every
      // row the pointer settles on, so the sidebar fills in as it is used.
      if (entry.detected === undefined) {
        entry.detected = detectSnippetLanguage(content)
        this.persist()
      }
      return content
    },
    // tags is optional — pass to replace the snippet's tags (the AAD is
    // unchanged, so this is a plain metadata + content update, no re-key).
    async update(id, { name, content, language, tags, tagColors = {} }) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return
      const box = await window.api.vaultEncrypt(
        content,
        entryAad(entry.id, entry.aadSalt, entry.createdAt)
      )
      // Key unavailable — leave the existing (still-decryptable) entry as-is.
      if (box?.error) {
        this.keyError = box.error
        return
      }
      entry.name = cleanName(name, entry.name)
      entry.detected = detectSnippetLanguage(content)
      if (language) entry.language = language
      if (tags !== undefined) entry.tags = this.registerTags(tags, tagColors)
      entry.iv = box.iv
      entry.data = box.data
      this.persist()
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
    },
    // --- tag management ---
    touchTag(name) {
      const t = this.tags[cleanTag(name)]
      if (t) {
        t.rank = nextRank(this.tags)
        this.persist()
      }
    },
    recolorTag(name, color) {
      const t = this.tags[cleanTag(name)]
      if (t && TAG_PALETTE.includes(color)) {
        t.color = color
        this.persist()
      }
    },
    renameTag(oldName, newName) {
      const o = cleanTag(oldName)
      const n = cleanTag(newName)
      if (!this.tags[o] || !n || o === n) return
      if (!this.tags[n]) this.tags[n] = { color: this.tags[o].color, rank: nextRank(this.tags) }
      delete this.tags[o]
      for (const e of this.entries) {
        const i = e.tags.indexOf(o)
        if (i > -1) {
          e.tags.splice(i, 1)
          if (!e.tags.includes(n) && e.tags.length < MAX_TAGS) e.tags.push(n)
        }
      }
      this.persist()
    },
    deleteTag(name) {
      const n = cleanTag(name)
      if (!this.tags[n]) return
      delete this.tags[n]
      for (const e of this.entries) {
        const i = e.tags.indexOf(n)
        if (i > -1) e.tags.splice(i, 1)
      }
      this.persist()
    },
    // --- delete confirmation flow (snippet | tag) ---
    requestDelete(type, id, name) {
      this.pendingDelete = { type, id, name }
    },
    confirmDelete() {
      const pending = this.pendingDelete
      this.pendingDelete = null
      if (!pending) return
      if (pending.type === 'tag') this.deleteTag(pending.id)
      else this.remove(pending.id)
    },
    cancelDelete() {
      this.pendingDelete = null
    },
    // --- export / import ---
    // A plaintext bundle { snippets:[{name,content,language,tags}], tags:{name:{color}} }.
    async _bundle(entries) {
      const snippets = []
      for (const entry of entries) {
        const content = await this.load(entry.id)
        if (content !== null) {
          snippets.push({
            name: entry.name,
            content,
            language: entry.language ?? 'auto',
            tags: [...entry.tags]
          })
        }
      }
      const tags = {}
      for (const s of snippets)
        for (const t of s.tags) if (this.tags[t]) tags[t] = { color: this.tags[t].color }
      return { snippets, tags }
    },
    async fullBundle() {
      return this._bundle(this.entries)
    },
    // Merge an in-memory bundle back in (config restore / import). Tag colors
    // are registered without clobbering existing ones; snippets are appended.
    // Also accepts a legacy { categories:[...] } bundle so old exports still
    // import — each category folds into a tag of the same name.
    async restoreBundle(bundle) {
      if (Array.isArray(bundle?.categories)) return this._restoreLegacyBundle(bundle.categories)
      this._registerBundleTags(bundle?.tags)
      for (const s of bundle?.snippets ?? []) {
        await this.add({
          name: s.name,
          content: s.content,
          language: s.language,
          tags: Array.isArray(s.tags) ? s.tags : []
        })
      }
    },
    // Colors from the bundle are honored only for tags this install doesn't
    // already know — a restore never repaints existing tags.
    _registerBundleTags(tags) {
      for (const [name, meta] of Object.entries(tags ?? {})) {
        const n = cleanTag(name)
        if (!n || this.tags[n]) continue
        this.tags[n] = {
          color: TAG_PALETTE.includes(meta?.color) ? meta.color : nextColor(this.tags),
          rank: nextRank(this.tags)
        }
      }
    },
    // Pre-tags export: each category folds into a tag of the same name.
    async _restoreLegacyBundle(categories) {
      for (const category of categories) {
        const tag = cleanTag(category.name)
        const tags = tag && tag !== 'default' ? [tag] : []
        for (const s of category.snippets ?? []) {
          await this.add({ name: s.name, content: s.content, language: s.language, tags })
        }
      }
    },
    async exportAll(passphrase) {
      return window.api.exportSnippets(
        await this._bundle(this.entries),
        passphrase,
        'diffbro-snippets'
      )
    },
    // Export the snippets carrying one tag ('' or null = the Default catch-all).
    async exportTag(name, passphrase) {
      const n = cleanTag(name)
      const entries = n
        ? this.entries.filter((e) => e.tags.includes(n))
        : this.entries.filter((e) => !e.tags.length)
      return window.api.exportSnippets(await this._bundle(entries), passphrase, n || 'default')
    },
    async importSnippets(passphrase) {
      const res = await window.api.importSnippets(passphrase)
      if (!res.ok) {
        if (!res.canceled) res.message = IMPORT_ERRORS[res.error] ?? 'Import failed.'
        return res
      }
      // The embedded signature only proves the bundle wasn't altered after
      // signing — the verifying key travels INSIDE the file, so it does NOT
      // prove the signer is trusted. Cross-check against trusted keys and label
      // it "unverified" otherwise; never present the signer as verified.
      const trusted = (await window.api.listTrustedKeys?.()) ?? []
      const match = trusted.find((t) => t.fingerprint === res.signer)
      res.signerNote = match
        ? `Signed by trusted key "${match.label}".`
        : `Signed by ${res.signer ?? 'an unknown key'} — unverified (not in your trusted keys).`
      await this.restoreBundle(res.bundle)
      return res
    }
  }
})
