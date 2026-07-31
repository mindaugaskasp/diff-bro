import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../persist'
import { useSnippetStore } from './snippetStore'

// Content crypto runs in main (vault:encrypt/decrypt); this store never sees the
// key. Only name/tags/timestamps are plaintext.
export const DEFAULT_TTL_HOURS = 1
export const MAX_TTL_HOURS = 24
export const TTL_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '8 hours', hours: 8 },
  { label: '24 hours', hours: 24 }
]

// Timestamps bind the ciphertext as AES-GCM AAD (tampering expiresAt makes the
// entry undecryptable); name/tags/favorite are deliberately excluded so they
// stay editable free metadata.
const entryAad = (id, createdAt, expiresAt, from) =>
  [id, createdAt, expiresAt, from ?? ''].join('|')

const EXT_TAG = { yml: 'yaml', htm: 'html', md: 'markdown', xlsx: 'excel', txt: null, text: null }
export function diffFormatTag(payload) {
  const extOf = (f) => /\.([a-z0-9]+)$/i.exec(f?.name ?? '')?.[1]?.toLowerCase() ?? null
  const raw = extOf(payload?.left) ?? extOf(payload?.right)
  if (!raw) return null
  const tag = raw in EXT_TAG ? EXT_TAG[raw] : raw
  return tag || null
}

// Tolerates the legacy category shape and the even older bare-array shape.
function readEntries() {
  const raw = loadPersisted('vault')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.entries)
        ? parsed.entries
        : []
    return list.map((e) => {
      // Coerce name/tags so old data can't throw downstream (not in the AAD, so
      // decryption is unaffected).
      const clean = {
        ...e,
        name: typeof e?.name === 'string' ? e.name : String(e?.name ?? 'Untitled diff'),
        tags: Array.isArray(e.tags) ? e.tags.filter((t) => typeof t === 'string') : []
      }
      delete clean.categoryId
      return clean
    })
  } catch {
    return []
  }
}

export const useVaultStore = defineStore('vault', {
  state: () => ({
    entries: readEntries(),
    now: Date.now(),
    pendingDelete: null,
    // Retag dialog: { id, name, tags } while open, null when closed.
    pendingRetag: null,
    // Vault key unavailable (locked keychain): hold, never purge — it may return.
    keyError: null
  }),
  getters: {
    // expiresAt === null is a "kept" (non-expiring) diff.
    active: (s) =>
      s.entries
        .filter((e) => e.expiresAt === null || e.expiresAt > s.now)
        .slice()
        .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)),
    favoritesOwn() {
      return this.active.filter((e) => !e.from && e.favorite)
    },
    ownActive() {
      return this.active.filter((e) => !e.from && !e.favorite)
    },
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
    // Re-read the persisted diffs from disk. The quick look-up window is a
    // separate Pinia instance, so it calls this on each summon to reflect diffs
    // the main window saved (or let expire) meanwhile.
    reload() {
      this.entries = readEntries()
      this.now = Date.now()
    },
    tick() {
      this.now = Date.now()
      const before = this.entries.length
      this.entries = this.entries.filter((e) => e.expiresAt === null || e.expiresAt > this.now)
      if (this.entries.length !== before) this.persist()
    },
    // ttlHours === null saves a "kept" diff that never expires (the save dialog's
    // "Secure" toggle off); any number gives an auto-expiring diff, capped at
    // 24 h. `tags` are the user's only — the format goes on `entry.format`, and
    // injecting it here too made a user tag matching the format vanish as a
    // duplicate of the auto one.
    async save(name, ttlHours, payload, tags = []) {
      let expiresAt = null
      if (ttlHours !== null) {
        const hours = Math.min(Math.max(ttlHours || DEFAULT_TTL_HOURS, 0.1), MAX_TTL_HOURS)
        expiresAt = Date.now() + hours * 3600_000
      }
      return this._add({ name, payload, createdAt: Date.now(), expiresAt, from: null, tags })
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
        // Plaintext metadata (not in the AAD): the compared files' format, so the
        // row can show a type monogram without decrypting the snapshot.
        format: diffFormatTag(payload),
        favorite: false,
        tags: applied,
        iv,
        data
      })
      this.persist()
      return id
    },
    // Retag a saved diff in place (plaintext metadata — no re-encryption).
    setTags(id, tags, colors = {}) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return
      entry.tags = useSnippetStore().registerTags(tags, colors)
      this.persist()
    },
    // Rename a saved diff in place. Like tags, the name is plaintext metadata
    // beside the ciphertext and deliberately outside the AAD, so this never
    // re-keys the entry.
    rename(id, name) {
      const entry = this.entries.find((e) => e.id === id)
      const clean = String(name ?? '')
        .trim()
        .slice(0, 120)
      if (!entry || !clean) return
      entry.name = clean
      this.persist()
    },
    requestRetag(id) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return
      this.pendingRetag = { id, name: entry.name, tags: [...(entry.tags || [])] }
    },
    cancelRetag() {
      this.pendingRetag = null
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
      // Tags travel with the diff (inside the signed+encrypted payload), so the
      // recipient sees them. The auto "imported" tag is local-only — never send
      // it, or a re-shared diff would accumulate "imported" tags.
      const tags = entry.tags.filter((t) => t !== 'imported')
      return window.api.shareExport(
        { name: entry.name, createdAt, expiresAt, snapshot: payload, tags },
        recipientFp
      )
    },
    // Share the CURRENT diff WITHOUT first persisting a local copy: seal from the
    // in-memory snapshot, and only once the sealed file is actually written do we
    // save the local twin. So cancelling the recipient picker OR the file dialog
    // leaves nothing behind (see diffStore.shareCurrent) — a share is all-or-nothing.
    async shareDraft({ name, ttlHours, snapshot, tags = [] }, recipientFp) {
      const now = Date.now()
      const localExpiresAt =
        ttlHours === null
          ? null
          : now + Math.min(Math.max(ttlHours || DEFAULT_TTL_HOURS, 0.1), MAX_TTL_HOURS) * 3600_000
      // The sealed copy MUST carry a finite ≤24 h expiry (sealing.js enforces it);
      // a kept local diff therefore shares with a fresh 24 h window.
      const expiresAt = localExpiresAt ?? now + MAX_TTL_HOURS * 3600_000
      const cleanTags = tags.filter((t) => t !== 'imported')
      const res = await window.api.shareExport(
        { name, createdAt: now, expiresAt, snapshot, tags: cleanTags },
        recipientFp
      )
      // Only a written file persists the local twin — a cancel writes nothing.
      if (res.ok) await this.save(name, ttlHours, snapshot, tags)
      return res
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
      const { name, snapshot, createdAt, expiresAt, tags } = res.entry
      const id = await this.addShared({
        name,
        payload: snapshot,
        createdAt,
        expiresAt,
        // Sender tags are untrusted — addShared → registerTags cleans and caps
        // them (and prepends the local "imported" tag).
        tags: Array.isArray(tags) ? tags : [],
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
