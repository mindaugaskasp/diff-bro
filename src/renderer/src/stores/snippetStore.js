import { defineStore } from 'pinia'
import { useVaultStore } from './vaultStore'
import { useUiStore } from './uiStore'
import { loadPersisted, savePersisted } from '../persist'
import {
  MAX_TAGS,
  TAG_PALETTE,
  cleanTag,
  dropTag,
  effectiveLanguage,
  migrate,
  nextColor,
  nextRank
} from '../utils/snippetState'
import { detectSnippetLanguage } from '../utils/detectLanguage'
import { parseTemplateVars } from '../utils/templateVars'
import { parseSnippetImport } from '../utils/snippetImport'
import { sentenceCaseName, untitledName } from '../utils/snippetName'
import { errorMessage } from '../utils/shareErrors'
import { t } from '../i18n'

// These snippets hold a link and are deliberately never shared.
export const URL_LANGUAGE = 'url'

// Personal, non-expiring text library, encrypted at rest with the vault key (crypto
// in main). Organized by TAGS: plaintext metadata, NOT in the AAD, so retagging
// never re-encrypts. Re-exported: many modules import these from this path.
export { MAX_TAGS, TAG_PALETTE, cleanTag } from '../utils/snippetState'

// The one seam every save runs through — add() and update() directly, and
// import/restore by way of add() — so sentence-casing here covers them all.
const cleanName = (name, fallback = untitledName()) =>
  sentenceCaseName(String(name ?? '').trim() || fallback)

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
  const state = migrate(parsed, t('snippetNotices.untitledSnippet'))
  savePersisted('snippets', JSON.stringify(state)) // write the migrated shape back
  return state
}

// Binds the ciphertext to immutable per-snippet values; aadSalt never changes,
// so tags stay free metadata.
const entryAad = (id, aadSalt, createdAt) => [id, aadSalt, createdAt].join('|')

// Seeded into an empty library so a first-time user sees a real snippet.
export const EXAMPLE_SNIPPET = {
  nameKey: 'snippetNotices.exampleMermaidDiagram',
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

// Seeded alongside the Mermaid example: a Claude prompt showing {{variables}} —
// copying it asks you to fill them in first (see SnippetFillDialog).
export const CLAUDE_EXAMPLE_SNIPPET = {
  nameKey: 'snippetNotices.exampleClaudeReviewPrompt',
  language: 'claude',
  tags: ['example', 'prompt'],
  content: `Review the {{language}} changes in {{file}} for correctness, edge cases, and {{concern}}.

Reply with a prioritized list — most critical first — and suggest a fix for each.`
}

// Effective syntax: the explicit language, else the `detected` one recorded at
// write time (content is encrypted, so the sidebar can't re-detect it).
/**
 * @param {import('../types').SnippetEntry} entry
 * @returns {string} Monaco language id the snippet resolves to
 */
export const languageOf = (entry) =>
  effectiveLanguage(entry?.language, entry?.detected ?? 'plaintext')

// Distinct {{variables}} in a claude prompt, stored as plaintext metadata so the
// sidebar row can flag "fillable on copy" without decrypting. Empty for every
// other language (where {{ }} is template code, not a fill placeholder).
const promptVars = (effectiveLang, content) =>
  effectiveLang === 'claude' ? parseTemplateVars(content) : []

// The snippet's format as a tag name (added on save so it's findable); null for
// plaintext/unknown.
export function formatTagFor(language, content) {
  const lang = effectiveLanguage(language, detectSnippetLanguage(content))
  return lang && lang !== 'plaintext' ? lang : null
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
    // { name, content } while the {{variables}} fill dialog is open (claude copy).
    pendingFill: null,
    // { type: 'snippet' | 'tag', id, name } while a delete confirmation is open.
    pendingDelete: null,
    // Surfaced, never a reason to drop snippets (they can't be re-fetched).
    keyError: null
  }),
  getters: {
    // Whether Mermaid's renderer is worth warming at idle: a library with no
    // diagram in it should not pay for a 2.8 MB chunk it will never render.
    hasDiagrams: (s) => s.entries.some((e) => languageOf(e) === 'mermaid'),
    favorites: (s) => s.entries.filter((e) => e.favorite).sort((a, b) => b.createdAt - a.createdAt),
    listed: (s) => s.entries.filter((e) => !e.favorite).sort((a, b) => b.createdAt - a.createdAt),
    // In-use tags, most-recent first; unused ones stay in the registry (keeping
    // their color) but off the shelf.
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
    colorOf: (s) => (name) => s.tags[cleanTag(name)]?.color ?? null,
    // What a tag is holding, so the confirm can say it BEFORE anything goes.
    /** @returns {(name: string) => { snippets: number, diffs: number }} */
    taggedCount: (s) => (name) => {
      const n = cleanTag(name)
      const has = (e) => e.tags?.includes(n)
      return {
        snippets: s.entries.filter(has).length,
        diffs: useVaultStore().entries.filter(has).length
      }
    }
  },
  actions: {
    persist() {
      savePersisted('snippets', JSON.stringify({ tags: this.tags, entries: this.entries }))
    },
    // The quick look-up window (separate Pinia instance) calls this on each
    // summon to pick up snippets changed in the main window.
    reload() {
      const s = readState()
      this.tags = s.tags
      this.entries = s.entries
    },
    // Register missing tags, touch used ones to "now", and return the cleaned,
    // de-duplicated, capped applied list.
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
    // Both first-run examples. Returns false if the vault key wasn't available,
    // so the caller retries next launch rather than recording them as seeded.
    // Never marks: a seeded row is not one the user made.
    async seedExamples() {
      for (const { nameKey, ...rest } of [EXAMPLE_SNIPPET, CLAUDE_EXAMPLE_SNIPPET]) {
        if (!(await this.add({ ...rest, name: t(nameKey), marks: false }))) return false
      }
      return true
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
    // `marks` is the new-row highlight, and it means "a user made this" — so
    // seeding, importing and restoring a backup all pass false. Marking the last
    // of thirty restored rows points at nothing anyone did.
    async add({
      name,
      content,
      language,
      tags = [],
      tagColors = {},
      secret = false,
      marks = true
    }) {
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
      const detected = detectSnippetLanguage(content)
      const eff = effectiveLanguage(language, detected)
      this.entries.push({
        id,
        aadSalt,
        name: cleanName(name),
        createdAt,
        // Free metadata beside createdAt — deliberately NOT in the AAD, so an
        // edit never has to re-key the entry. Groundwork for snippet history.
        updatedAt: createdAt,
        language: language || 'auto',
        detected,
        vars: promptVars(eff, content),
        favorite: false,
        // Display-only: the contents are already encrypted at rest, so this
        // decides what gets drawn, never what gets stored (see secretSnippet.js).
        secret: secret === true,
        tags: applied,
        iv: box.iv,
        data: box.data
      })
      if (marks) useUiStore().markNewRow(id)
      this.persist()
      return id
    },
    // Import snippets from a chosen file (VS Code .code-snippets JSON or any
    // text file). The file is validated + size-capped in parseSnippetImport;
    // each draft is re-encrypted through add() before it is stored.
    async importFromFile() {
      const file = await window.api.openFile('snippets')
      if (!file) return { cancelled: true }
      if (file.error || typeof file.content !== 'string') return { count: 0 }
      const { snippets, error } = parseSnippetImport(file.content, file.name)
      if (error) return { error }
      let count = 0
      for (const draft of snippets) {
        if (await this.add({ ...draft, marks: false })) count++
      }
      return { count }
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
      // Backfill `detected`/`vars` for pre-field snippets — the one place their
      // plaintext is in hand.
      let changed = false
      if (entry.detected === undefined) {
        entry.detected = detectSnippetLanguage(content)
        changed = true
      }
      if (entry.vars === undefined) {
        entry.vars = promptVars(languageOf(entry), content)
        changed = true
      }
      if (changed) this.persist()
      return content
    },
    // tags optional; the AAD is unchanged, so this is a metadata + content
    // update, no re-key.
    async update(id, { name, content, language, tags, tagColors = {}, secret }) {
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
      entry.vars = promptVars(languageOf(entry), content)
      if (tags !== undefined) entry.tags = this.registerTags(tags, tagColors)
      if (secret !== undefined) entry.secret = secret === true
      entry.iv = box.iv
      entry.data = box.data
      // createdAt is in the AAD and must never move; this is the mutable half.
      entry.updatedAt = Date.now()
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
      const tag = this.tags[cleanTag(name)]
      if (tag) {
        tag.rank = nextRank(this.tags)
        this.persist()
      }
    },
    recolorTag(name, color) {
      const tag = this.tags[cleanTag(name)]
      if (tag && TAG_PALETTE.includes(color)) {
        tag.color = color
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
    /**
     * Remove a tag from the registry. By default the records keep living and
     * only lose the label; `withEntries` deletes everything carrying it.
     *
     * Saved diffs draw from this same registry (vaultStore calls registerTags),
     * so both sides are swept — a tag left on a saved diff would be one the app
     * no longer knows the colour of.
     * @param {string} name
     * @param {{ withEntries?: boolean }} [opts]
     */
    deleteTag(name, { withEntries = false } = {}) {
      const n = cleanTag(name)
      if (!this.tags[n]) return
      delete this.tags[n]
      const vault = useVaultStore()
      if (withEntries) {
        for (const e of this.entries.filter((e) => e.tags.includes(n))) this.remove(e.id)
        for (const e of vault.entries.filter((e) => e.tags?.includes(n))) vault.remove(e.id)
      }
      dropTag(this.entries, n)
      dropTag(vault.entries, n)
      vault.persist()
      this.persist()
    },
    // --- delete confirmation flow (snippet | tag) ---
    requestDelete(type, id, name) {
      this.pendingDelete = { type, id, name }
    },
    /** @param {{ withEntries?: boolean }} [opts]  tag deletes only */
    confirmDelete({ withEntries = false } = {}) {
      const pending = this.pendingDelete
      this.pendingDelete = null
      if (!pending) return
      if (pending.type === 'tag') this.deleteTag(pending.id, { withEntries })
      else this.remove(pending.id)
    },
    cancelDelete() {
      this.pendingDelete = null
    },
    // --- export / import ---
    // A plaintext bundle { snippets:[{name,content,language,tags}], tags:{name:{color}} }.
    async _bundle(entries) {
      const snippets = []
      // A URL snippet is local-only: it must never leave this machine, so a
      // shared bundle can never carry a link someone else's click would open.
      for (const entry of entries.filter((e) => e.language !== URL_LANGUAGE)) {
        const content = await this.load(entry.id)
        if (content !== null) {
          snippets.push({
            name: entry.name,
            content,
            language: entry.language ?? 'auto',
            // Carried so a restored secret comes back masked; a bundle that
            // dropped the flag would silently expose it on the other side.
            secret: entry.secret === true,
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
    // Merge a bundle in (restore/import): appends snippets, keeps existing tag
    // colors. Also accepts the legacy categories shape.
    async restoreBundle(bundle) {
      if (Array.isArray(bundle?.categories)) return this._restoreLegacyBundle(bundle.categories)
      this._registerBundleTags(bundle?.tags)
      for (const s of bundle?.snippets ?? []) {
        // The other half of the rule: a crafted bundle cannot plant one either.
        if (s.language === URL_LANGUAGE) continue
        await this.add({
          name: s.name,
          content: s.content,
          language: s.language,
          secret: s.secret === true,
          tags: Array.isArray(s.tags) ? s.tags : [],
          marks: false
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
          if (s.language === URL_LANGUAGE) continue
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
        if (!res.canceled) res.message = errorMessage(res.error, t, 'shareErrors.importFailed')
        return res
      }
      // `res.signer` is resolved in MAIN from the trust store by matching the key
      // that actually signed — never the fingerprint the file claims, which the
      // sender writes. Null means signed by a key you do not trust.
      const trusted = (await window.api.listTrustedKeys?.()) ?? []
      const match = trusted.find((t) => t.fingerprint === res.signer)
      res.signerNote = match
        ? t('snippetNotices.signedByTrustedKey', { label: match.label })
        : t('snippetNotices.signedButNotByAny')
      await this.restoreBundle(res.bundle)
      return res
    }
  }
})
