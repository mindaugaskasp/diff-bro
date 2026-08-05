// What this install's data is MADE of, and how it travels when the folder
// moves. Pure so the list can be checked against the source that writes it —
// three files were missing from it, and a missing name is silent data loss.

/**
 * The renderer's key/value stores, each backed by `<name>.json`, and the
 * allowlist store:load / store:save validate against. A closed list rather than
 * a character class, because the name becomes a path and a legal-looking one is
 * still not a store: `trusted-keys` would rewrite the trust store.
 */
export const STORE_NAMES = [
  'vault', // saved diffs (encrypted at rest) — stores/vaultStore.js
  'snippets', // snippet library (encrypted at rest) — stores/snippetStore.js
  'session', // the comparisons left open (encrypted at rest) — stores/tabsStore.js
  'settings', // preferences — stores/settingsStore.js, and readSettings in main
  'theme', // chosen theme — stores/settingsStore.js, renderer/quicklook.js
  'email', // mail hand-off defaults — features/email/emailStore.js
  'onboarding', // tour progress — features/onboarding/onboardingStore.js
  'sidebar', // sidebar width — composables/useSidebarResize.js
  'tools' // pinned tools — features/tools/toolsStore.js
]

const ALLOWED_STORES = new Set(STORE_NAMES)

/** @param {unknown} name */
export const isStoreName = (name) => typeof name === 'string' && ALLOWED_STORES.has(name)

/**
 * Every file that makes up this install's data — moved together when the
 * location changes, so the folder is self-contained and portable. The stores
 * are derived, so a new one cannot reach the data directory without also
 * travelling with it.
 */
export const DATA_FILES = [
  ...STORE_NAMES.map((name) => `${name}.json`),
  'identity.key', // private identity key (OS-keychain wrapped)
  'identity.pub', // public identity key
  'trusted-keys.json', // trusted peers
  'vault.key', // vault encryption key (OS-keychain wrapped)
  'retired-keys.key' // decrypt-only keys rotated away from
]

/**
 * @typedef {object} DataDirCopy
 * @property {string} from
 * @property {string} to
 * @property {string|null} displace  an existing destination file to rename first
 */

/**
 * The copies a move needs. Choosing a folder ADOPTS whatever data is already
 * there, which is what makes re-pointing at a folder after a reinstall restore
 * it. A RESET is the other direction — the data in use travels home — so it
 * passes `sourceWins`, and the stale copy sitting at the destination is renamed
 * aside rather than silently winning or being overwritten.
 * @param {object} opts
 * @param {string[]} opts.files
 * @param {(path: string) => boolean} opts.exists
 * @param {string} opts.from
 * @param {string} opts.to
 * @param {(dir: string, name: string) => string} opts.join
 * @param {boolean} [opts.sourceWins]
 * @returns {DataDirCopy[]}
 */
export function planDataDirMove({ files, exists, from, to, join, sourceWins = false }) {
  const plan = []
  for (const name of files) {
    const src = join(from, name)
    const dest = join(to, name)
    if (!exists(src)) continue
    const occupied = exists(dest)
    if (occupied && !sourceWins) continue
    plan.push({ from: src, to: dest, displace: occupied ? `${dest}.superseded` : null })
  }
  return plan
}
