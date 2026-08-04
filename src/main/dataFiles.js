// What this install's data is MADE of, and how it travels when the folder
// moves. Pure so the list can be checked against the source that writes it —
// three files were missing from it, and a missing name is silent data loss.

/**
 * Every file that makes up this install's data — moved together when the
 * location changes, so the folder is self-contained and portable.
 */
export const DATA_FILES = [
  'vault.json', // saved diffs (encrypted at rest)
  'snippets.json', // snippet library (encrypted at rest)
  'session.json', // the comparisons left open (encrypted at rest)
  'identity.key', // private identity key (OS-keychain wrapped)
  'identity.pub', // public identity key
  'trusted-keys.json', // trusted peers
  'vault.key', // vault encryption key (OS-keychain wrapped)
  'retired-keys.key', // decrypt-only keys rotated away from
  'settings.json', // preferences
  'email.json', // mail hand-off message defaults
  'theme.json' // chosen theme
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
