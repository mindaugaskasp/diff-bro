// Turning a snippet into a comparison side. Pure so the rules — what a secret
// snippet may become, and what a drag payload is allowed to say — are testable
// without a drag event or a store.

import { isSecret } from './secretSnippet'
import { untitledName } from './snippetName'

// Our own drag flavour. `Files` is the OS one; anything else on the drag is not
// a snippet of ours and is ignored.
export const DRAG_TYPE = 'application/x-diffbro-snippet'

// A comparison has two sides, and an id is a uuid. Both caps exist so a crafted
// drag cannot make the app decrypt an unbounded list of anything.
const MAX_IDS = 2
const MAX_ID_CHARS = 200

/**
 * The side object a dropped snippet becomes — the same shape pasted text
 * produces, plus the id that keeps it live. Null when it must not be compared.
 * @param {import('../types').SnippetEntry|null} entry
 * @param {string|null} content  the decrypted body
 * @returns {{ path: null, name: string, content: string, snippetId: string }|null}
 */
export function snippetSource(entry, content) {
  if (!entry || typeof content !== 'string') return null
  if (isSecret(entry)) return null
  return {
    path: null,
    name: String(entry.name ?? '').trim() || untitledName(),
    content,
    snippetId: entry.id
  }
}

/**
 * The snippet ids a drag carries. Only ids travel — never content — so this
 * never returns anything the store cannot vouch for.
 * @param {DataTransfer|null} transfer
 * @returns {string[]}
 */
export function dragIdsFrom(transfer) {
  if (!Array.from(transfer?.types ?? []).includes(DRAG_TYPE)) return []
  let parsed
  try {
    parsed = JSON.parse(transfer.getData(DRAG_TYPE))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((id) => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_CHARS)
    .slice(0, MAX_IDS)
}
