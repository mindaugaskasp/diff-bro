import { defineStore } from 'pinia'

// Saved diffs are a security-sensitive convenience: content is AES-256-GCM
// encrypted with an install-specific key held by the main process (backed by
// the OS keychain), and every entry auto-expires — default 1 hour, hard cap
// 24 hours. Only the entry name and timestamps are stored in plaintext.
const STORAGE_KEY = 'diffbro.vault'
export const DEFAULT_TTL_HOURS = 1
export const MAX_TTL_HOURS = 24
export const TTL_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '8 hours', hours: 8 },
  { label: '24 hours', hours: 24 }
]

let cryptoKeyPromise = null

function getCryptoKey() {
  cryptoKeyPromise ??= (async () => {
    const b64 = await window.api.getVaultKey()
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  })()
  return cryptoKeyPromise
}

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

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
      await this._add(name, payload, Date.now(), Date.now() + hours * 3600_000, null)
    },
    // Entry received from another machine: keep the sender's absolute
    // timestamps so it expires at the same moment everywhere (the 24 h cap
    // was already enforced during signature verification in main).
    async addShared(name, payload, createdAt, expiresAt, from) {
      await this._add(name, payload, createdAt, expiresAt, from)
    },
    async _add(name, payload, createdAt, expiresAt, from) {
      const key = await getCryptoKey()
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const plaintext = new TextEncoder().encode(JSON.stringify(payload))
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
      this.entries.push({
        id: crypto.randomUUID(),
        name: name || 'Untitled diff',
        createdAt,
        expiresAt,
        from: from ?? null,
        iv: toB64(iv),
        data: toB64(ciphertext)
      })
      this.persist()
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
      try {
        const key = await getCryptoKey()
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromB64(entry.iv) },
          key,
          fromB64(entry.data)
        )
        return JSON.parse(new TextDecoder().decode(plaintext))
      } catch {
        // Undecryptable (key rotated / data corrupted) — drop the entry.
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
