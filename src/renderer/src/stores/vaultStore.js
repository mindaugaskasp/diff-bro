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
const entryAad = (id, createdAt, expiresAt, from) =>
  [id, createdAt, expiresAt, from ?? ''].join('|')

function readEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
  } catch {
    return []
  }
}

export const useVaultStore = defineStore('vault', {
  state: () => ({
    entries: readEntries(), // [{ id, name, createdAt, expiresAt, iv, data }]
    // re-render trigger for the expiry countdowns
    now: Date.now()
  }),
  getters: {
    active: (s) => s.entries.filter((e) => e.expiresAt > s.now)
  },
  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries))
    },
    tick() {
      this.now = Date.now()
      const before = this.entries.length
      this.entries = this.entries.filter((e) => e.expiresAt > this.now)
      if (this.entries.length !== before) this.persist()
    },
    async save(name, ttlHours, payload) {
      const hours = Math.min(Math.max(ttlHours || DEFAULT_TTL_HOURS, 0.1), MAX_TTL_HOURS)
      return this._add(name, payload, Date.now(), Date.now() + hours * 3600_000, null)
    },
    // Entry received from another machine: keep the sender's absolute
    // timestamps so it expires at the same moment everywhere (the 24 h cap
    // was already enforced during signature verification in main).
    async addShared(name, payload, createdAt, expiresAt, from) {
      await this._add(name, payload, createdAt, expiresAt, from)
    },
    async _add(name, payload, createdAt, expiresAt, from) {
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
        iv,
        data
      })
      this.persist()
      return id
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
    }
  }
})
