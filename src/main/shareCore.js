// The parts of share.js that need no Electron: the identity guard and the
// validation a restored config must pass. Kept here so they are unit-testable —
// share.js itself is glue, and logic hidden inside it goes unmeasured.
import { fingerprint } from './sealing'

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

const isRestorableIdentity = (identity) =>
  !!identity?.priv?.sign && !!identity?.priv?.box && isTrustedEntry(identity.pub)

/**
 * Vet a decrypted config backup before any of it is written. A file that
 * decrypts is still untrusted input (docs/standards.md rule 6): the trust list
 * used to go to disk unvalidated, and an unparseable key there made every
 * later sealed import throw.
 * @param {{ identity?: object, trusted?: unknown, snippets?: unknown }} bundle
 * @param {{ snippetError?: (snippets: unknown) => string|null }} [deps]
 * @returns {{ error?: string, identity?: object|null, trusted?: object[]|null }}
 */
export function validateRestoredConfig({ identity, trusted, snippets }, deps = {}) {
  const snippetError = snippetVerdict(snippets, deps.snippetError)
  if (snippetError) return { error: snippetError }
  if (identity != null && !isRestorableIdentity(identity)) return { error: 'malformed' }

  const list = listVerdict(trusted)
  if (list === false) return { error: 'malformed' }
  return { identity: identity ?? null, trusted: list }
}

const snippetVerdict = (snippets, check) => (snippets == null ? null : check?.(snippets))

// The vetted list, null when the backup carried none, false when it is unusable.
function listVerdict(trusted) {
  if (!Array.isArray(trusted)) return null
  return trusted.every(isTrustedEntry) && trusted
}
