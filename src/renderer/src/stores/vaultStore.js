import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../persist'
import { useSnippetStore } from './snippetStore'
import { useTabsStore } from './tabsStore'
import { sealableFromDraft, sealableFromEntry, ttlSpan } from '../utils/shareEntry'
import { t } from '../i18n'

// Content crypto runs in main (vault:*); only name/tags/timestamps are plaintext.
// Re-exported: many modules import these from here; they live in
// utils/shareEntry.js so the expiry maths stays unit-testable.
export { DEFAULT_TTL_HOURS, MAX_KEEP_HOURS } from '../utils/shareEntry'
export const TTL_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '8 hours', hours: 8 },
  { label: '24 hours', hours: 24 },
  { label: '2 days', hours: 48 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 }
]

// Timestamps bind the ciphertext as AES-GCM AAD (tampering expiresAt makes it
// undecryptable); name/tags/favorite are excluded so they stay free metadata.
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
        name:
          typeof e?.name === 'string' ? e.name : String(e?.name ?? t('vaultNotices.untitledDiff')),
        tags: Array.isArray(e.tags) ? e.tags.filter((t) => typeof t === 'string') : [],
        sharedTo: readSharedTo(e.sharedTo)
      }
      delete clean.categoryId
      return clean
    })
  } catch {
    return []
  }
}

// Who a diff was sealed for, and when. LOCAL ONLY, by construction: sealEntry
// is handed { name, createdAt, expiresAt, snapshot, tags } and never the entry
// itself, so this cannot travel inside a share — which matters, because it is a
// list of who else you sent something to.
//
// Only the fingerprint is kept. Labels are resolved live from the trust store,
// so renaming a key renames it here too, and removing one leaves the record
// honest rather than stale.
function readSharedTo(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r) => typeof r?.fp === 'string' && r.fp)
    .map((r) => ({ fp: r.fp, at: Number.isFinite(r.at) ? r.at : 0 }))
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
    },
    // Every diff sealed for a fingerprint, most recent first. Asked before a
    // trusted key is removed, so the answer to "what did I send this person"
    // is on screen at the moment the decision is made.
    /** @returns {(fp: string) => Array<{ id, name, at }>} */
    sharedWith: (s) => (fp) =>
      s.entries
        .flatMap((e) =>
          (e.sharedTo ?? [])
            .filter((r) => r.fp === fp)
            .map((r) => ({ id: e.id, name: e.name, at: r.at }))
        )
        .sort((a, b) => b.at - a.at)
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
    // "Secure" toggle off); any number gives an auto-expiring diff, capped at the
    // keep ceiling. `tags` are the user's only — the format goes on
    // `entry.format`, and injecting it here too made a user tag matching the
    // format vanish as a duplicate of the auto one.
    async save(name, ttlHours, payload, tags = []) {
      const expiresAt = ttlHours === null ? null : Date.now() + ttlSpan(ttlHours)
      return this._add({ name, payload, createdAt: Date.now(), expiresAt, from: null, tags })
    },
    /**
     * Re-seal an entry in place: same diff, newer contents, so id/createdAt/star
     * survive. The AAD moves with the new expiry, so the old ciphertext cannot
     * be replayed under it.
     * @param {string} id
     * @param {{ name: string, ttlHours: number|null, payload: object, tags: string[] }} next
     * @returns {Promise<string|null>} the id, or null when the key is unavailable
     */
    async update(id, { name, ttlHours, payload, tags = [] }) {
      const entry = this.entries.find((e) => e.id === id)
      // A diff someone else signed is theirs; the caller makes a new one.
      if (!entry || entry.from) return null
      const expiresAt = ttlHours === null ? null : Date.now() + ttlSpan(ttlHours)
      const box = await window.api.vaultEncrypt(
        JSON.stringify(payload),
        entryAad(entry.id, entry.createdAt, expiresAt, entry.from)
      )
      if (box?.error) {
        this.keyError = box.error
        return null
      }
      entry.expiresAt = expiresAt
      entry.name = name || entry.name
      entry.format = diffFormatTag(payload)
      entry.tags = useSnippetStore().registerTags(tags)
      entry.iv = box.iv
      entry.data = box.data
      this.persist()
      return entry.id
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
        name: name || t('vaultNotices.untitledDiff'),
        createdAt,
        expiresAt,
        from: from ?? null,
        // Plaintext metadata (not in the AAD): the compared files' format, so the
        // row can show a type monogram without decrypting the snapshot.
        format: diffFormatTag(payload),
        favorite: false,
        tags: applied,
        // Same shape as a loaded entry, so nothing has to care whether this one
        // has been through the store file yet.
        sharedTo: [],
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
    // Null when the entry cannot be read (missing, or the vault key is locked).
    async entryForShare(id) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return null
      const payload = await this.load(id)
      return payload ? sealableFromEntry(entry, payload) : null
    },
    draftEntry: (draft) => sealableFromDraft(draft),
    async share(id, recipientFps) {
      const sealable = await this.entryForShare(id)
      if (!sealable) return { error: 'missing' }
      const res = await window.api.shareExport(sealable, recipientFps)
      // Only a WRITTEN file is a share. Cancelling the save dialog must not
      // leave a record of something that was never sent.
      if (res?.ok) this.recordShare(id, recipientFps)
      return res
    },
    // Share the CURRENT diff WITHOUT first persisting a local copy: seal from the
    // in-memory snapshot, and only once the sealed file is actually written do we
    // save the local twin. So cancelling the recipient picker OR the file dialog
    // leaves nothing behind (see diffStore.shareCurrent) — a share is all-or-nothing.
    async shareDraft(draft, recipientFps) {
      const res = await window.api.shareExport(this.draftEntry(draft), recipientFps)
      if (!res.ok) return res
      return { ...res, localCopy: await this.saveShareTwin(draft, recipientFps) }
    },
    // The local twin of a draft that WAS sealed. A copy that could not be saved
    // (locked vault key) is reported rather than passed off as a full share.
    async saveShareTwin({ name, ttlHours, snapshot, tags = [] }, recipientFps) {
      const id = await this.save(name, ttlHours, snapshot, tags)
      if (id) this.recordShare(id, recipientFps)
      return !!id
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
    /**
     * Every kept diff, decrypted, for a passphrase-sealed backup. The vault key
     * never travels — the caller re-seals this under the user's passphrase,
     * which is what makes the archive openable on another machine.
     *
     * Expiring diffs are left out for the reason autoBackup already leaves them
     * out: the reader asked them to die, and restoring one later undoes that.
     * @returns {Promise<{ diffs: Array<{name: string, payload: object, tags: string[]}> }>}
     */
    async fullBundle() {
      const diffs = []
      for (const entry of this.entries) {
        if (entry.expiresAt !== null) continue
        const payload = await this.load(entry.id)
        if (payload == null) continue
        diffs.push({ name: entry.name, payload, tags: entry.tags ?? [] })
      }
      return { diffs }
    },
    /**
     * Merge a backup's diffs back in, re-encrypting each under THIS vault's key.
     * The bundle came off disk, so an entry that is not the shape it claims is
     * skipped rather than trusted.
     * @param {{ diffs?: unknown[] }} bundle
     */
    async restoreBundle(bundle) {
      for (const d of bundle?.diffs ?? []) {
        if (!d || typeof d !== 'object' || !d.payload || typeof d.payload !== 'object') continue
        await this._add({
          name: typeof d.name === 'string' ? d.name : '',
          payload: d.payload,
          createdAt: Date.now(),
          expiresAt: null,
          from: null,
          tags: Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string') : []
        })
      }
    },
    /**
     * Note that this diff was sealed for these recipients. Re-sharing to the
     * same key updates when, rather than stacking duplicates.
     * @param {string} id
     * @param {string[]} recipientFps
     */
    recordShare(id, recipientFps) {
      const entry = this.entries.find((e) => e.id === id)
      if (!entry) return
      const at = Date.now()
      const byFp = new Map((entry.sharedTo ?? []).map((r) => [r.fp, r]))
      for (const fp of recipientFps ?? []) if (fp) byFp.set(fp, { fp, at })
      entry.sharedTo = [...byFp.values()]
      this.persist()
    },
    remove(id) {
      this.entries = this.entries.filter((e) => e.id !== id)
      useTabsStore().forgetEntry(id)
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
