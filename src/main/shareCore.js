// The parts of share.js that need no Electron: the identity guard and the
// validation a restored config must pass. Kept here so they are unit-testable —
// share.js itself is glue, and logic hidden inside it goes unmeasured.
import { fingerprint } from './sealing'
import { isValidEmail } from './mailAddress'

export class IdentityUnavailable extends Error {
  constructor() {
    super('identity unavailable')
    this.name = 'IdentityUnavailable'
  }
}

/**
 * Surface an unloadable identity as a plain error object rather than a rejected
 * IPC promise — the renderer has no catch on these calls, so a rejection shows
 * the user nothing at all.
 * @template {(...args: any[]) => Promise<any>} F
 * @param {F} fn
 * @returns {F}
 */
export const guardIdentity =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args)
    } catch (err) {
      if (err instanceof IdentityUnavailable) return { error: 'identity-unavailable' }
      throw err
    }
  }

// A fingerprint recomputed from the key material itself: the stored one is a
// claim, this is the fact. Anything that will not parse fails here.
const matchesOwnKeys = (entry) => {
  try {
    return fingerprint(entry.sign, entry.box) === entry.fingerprint
  } catch {
    return false
  }
}

const isTrustedEntry = (entry) =>
  !!entry &&
  typeof entry.fingerprint === 'string' &&
  typeof entry.sign === 'string' &&
  typeof entry.box === 'string' &&
  matchesOwnKeys(entry)

// A restored entry's email is a convenience, not a credential, so a bad one
// drops the field rather than failing the whole restore — losing an address is
// recoverable by typing it again; losing the trust list is not. Dropping it is
// still mandatory: an unvalidated address would reach a mailto: header.
const withVettedEmail = (entry) => {
  if (isValidEmail(entry.email)) return entry
  // Omit the key rather than setting it undefined: `share:setTrustedEmail`
  // deletes, and the two must agree on what "no address" looks like on disk.
  const rest = { ...entry }
  delete rest.email
  return rest
}

const isRestorableIdentity = (identity) =>
  !!identity?.priv?.sign && !!identity?.priv?.box && isTrustedEntry(identity.pub)

// The same reasoning as SNIPPET_LIMITS: a decryptable backup is still a file
// off disk, and the renderer re-encrypts every diff it is handed one IPC call
// at a time. Uncapped, a crafted bundle is an unbounded write loop.
export const VAULT_LIMITS = { diffs: 5000, nameBytes: 512, tagsPerDiff: 20 }

const byteLen = (s) => Buffer.byteLength(String(s), 'utf8')

const okName = (name, limits) =>
  name == null || (typeof name === 'string' && byteLen(name) <= limits.nameBytes)

const okTags = (tags, limits) =>
  tags == null ||
  (Array.isArray(tags) &&
    tags.length <= limits.tagsPerDiff &&
    tags.every((t) => typeof t === 'string'))

const isRestorableDiff = (d, limits) =>
  !!d &&
  typeof d === 'object' &&
  !!d.payload &&
  typeof d.payload === 'object' &&
  okName(d.name, limits) &&
  okTags(d.tags, limits)

// The vetted bundle, null when the backup carried none, false when unusable.
function vaultVerdict(vault, limits = VAULT_LIMITS) {
  if (vault == null) return null
  if (typeof vault !== 'object' || !Array.isArray(vault.diffs)) return false
  if (vault.diffs.length > limits.diffs) return false
  return vault.diffs.every((d) => isRestorableDiff(d, limits)) && vault
}

/**
 * Vet a decrypted config backup before any of it is written. A file that
 * decrypts is still untrusted input (docs/standards.md rule 6): the trust list
 * used to go to disk unvalidated, and an unparseable key there made every
 * later sealed import throw.
 * @param {{ identity?: object, trusted?: unknown, snippets?: unknown, vault?: unknown }} bundle
 * @param {{ snippetError?: (snippets: unknown) => string|null }} [deps]
 * @returns {{ error?: string, identity?: object|null, trusted?: object[]|null,
 *            vault?: object|null }}
 */
export function validateRestoredConfig({ identity, trusted, snippets, vault }, deps = {}) {
  const snippetError = snippetVerdict(snippets, deps.snippetError)
  if (snippetError) return { error: snippetError }
  if (identity != null && !isRestorableIdentity(identity)) return { error: 'malformed' }

  const list = listVerdict(trusted)
  if (list === false) return { error: 'malformed' }
  const diffs = vaultVerdict(vault)
  if (diffs === false) return { error: 'malformed' }
  return { identity: identity ?? null, trusted: list, vault: diffs }
}

const snippetVerdict = (snippets, check) => (snippets == null ? null : check?.(snippets))

// The vetted list, null when the backup carried none, false when it is unusable.
function listVerdict(trusted) {
  if (!Array.isArray(trusted)) return null
  return trusted.every(isTrustedEntry) && trusted.map(withVettedEmail)
}
