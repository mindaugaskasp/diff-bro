// Durable persistence for the Pinia stores. Backed by files in the app's
// configurable data directory (main process) so the data survives an app
// reinstall when that directory lives outside userData. Reads are synchronous
// (window.api.storeLoad uses a sync IPC), so stores initialize during setup
// exactly as they did with localStorage.
//
// Without the store IPC (unit tests, a stray render) it falls back to localStorage.
const localKey = (name) => `diffbro.${name}`

// Returns the stored JSON string, or null.
export function loadPersisted(name) {
  if (typeof window.api?.storeLoad !== 'function') return localStorage.getItem(localKey(name))
  return window.api.storeLoad(name)
}

function writePersisted(name, contents) {
  if (typeof window.api?.storeSave === 'function') window.api.storeSave(name, contents)
  else localStorage.setItem(localKey(name), contents)
}

// Writes to these keys wait in memory until released: Settings edits a draft
// that only reaches disk on Save.
let held = null

/** @param {string[]} names */
export function holdPersisted(names) {
  held = { names: new Set(names), pending: new Map() }
}

/** @param {boolean} commit write what was held, or drop it */
export function releasePersisted(commit) {
  const pending = held?.pending
  held = null
  if (commit) for (const [name, contents] of pending ?? []) writePersisted(name, contents)
}

export function savePersisted(name, contents) {
  if (held?.names.has(name)) held.pending.set(name, contents)
  else writePersisted(name, contents)
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
