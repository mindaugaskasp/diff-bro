// Durable persistence for the Pinia stores. Backed by files in the app's
// configurable data directory (main process) so the data survives an app
// reinstall when that directory lives outside userData. Reads are synchronous
// (window.api.storeLoad uses a sync IPC), so stores initialize during setup
// exactly as they did with localStorage.
//
// A one-time migration pulls each store forward from its old localStorage key
// and never deletes it, so nothing is lost. When the store IPC isn't available
// (unit tests, or a stray render), it falls back to localStorage unchanged.
const LEGACY_KEY = { vault: 'diffbro.vault', snippets: 'diffbro.snippets' }
const legacyKey = (name) => LEGACY_KEY[name] ?? `diffbro.${name}`

// Returns the stored JSON string, or null.
export function loadPersisted(name) {
  if (typeof window.api?.storeLoad !== 'function') {
    return localStorage.getItem(legacyKey(name))
  }
  let raw = window.api.storeLoad(name)
  if (raw == null) {
    // First run on this version: migrate the old localStorage copy into the
    // data directory (kept in localStorage too, as a safety net).
    const legacy = localStorage.getItem(legacyKey(name))
    if (legacy != null) {
      raw = legacy
      window.api.storeSave(name, legacy)
    }
  }
  return raw
}

export function savePersisted(name, contents) {
  if (typeof window.api?.storeSave === 'function') window.api.storeSave(name, contents)
  else localStorage.setItem(legacyKey(name), contents)
}

// The parse every caller was hand-rolling around loadPersisted, with the same
// try/catch each time. Storage is this module's boundary, so the JSON is too.
/**
 * @param {string} name
 * @param {object} [fallback] returned for a missing, empty or corrupt value
 * @returns {object}
 */
export function loadPersistedJson(name, fallback = {}) {
  try {
    return JSON.parse(loadPersisted(name) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}
