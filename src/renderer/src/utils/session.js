// What the open comparisons look like on disk, so a quit is not a loss. Pure:
// the store owns the crypto and the writing, this owns WHAT is worth keeping
// and hands back a shape restore can trust.
import { MAX_TABS, isBlank } from './tabs'

// Bumped only when the stored shape changes meaning; an unrecognised version is
// dropped rather than guessed at.
export const SESSION_VERSION = 1

// Serialized bytes. The session is rewritten on a debounce, so this is a write
// cost as much as a disk one. A tab that doesn't fit is left OUT whole — half a
// comparison restored is a lie about what you had open.
export const MAX_SESSION_BYTES = 5_000_000
export const MAX_TAB_BYTES = 2_000_000

const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback)

const readGrid = (side) =>
  side.kind === 'spreadsheet' && Array.isArray(side.sheets)
    ? { kind: 'spreadsheet', sheets: side.sheets }
    : null

// Only the fields a side is rendered and compared through. What the loader left
// on it (encoding, size on disk) nothing reads, so a restored side carries no
// more than the comparison needs.
function readSide(side) {
  if (!side || typeof side !== 'object' || Array.isArray(side)) return null
  const grid = readGrid(side)
  const text = typeof side.content === 'string' ? { content: side.content } : null
  if (!grid && !text) return null
  return {
    path: str(side.path, null) || null,
    name: str(side.name, 'Untitled'),
    // The refresh guard needs its baseline back, or a restored formatted side
    // reports a change nobody made (see diffStore._reloadSlot).
    ...(side.edited === true
      ? { edited: true, diskContent: str(side.diskContent, null) ?? undefined }
      : {}),
    ...text,
    ...grid
  }
}

/**
 * A stored snapshot, coerced back into the shape diffStore.restore() expects.
 * @param {object} [raw]
 * @returns {import('../types').DiffSnapshot|null}
 */
export function readSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    mode: raw.mode === 'paste' ? 'paste' : 'files',
    left: readSide(raw.left),
    right: readSide(raw.right),
    pasteLeft: str(raw.pasteLeft),
    pasteRight: str(raw.pasteRight),
    pasteLeftFile: readSide(raw.pasteLeftFile),
    pasteRightFile: readSide(raw.pasteRightFile),
    pasteLeftName: str(raw.pasteLeftName),
    pasteRightName: str(raw.pasteRightName),
    renderSideBySide: raw.renderSideBySide !== false,
    ignoreTrimWhitespace: raw.ignoreTrimWhitespace === true,
    semanticView: raw.semanticView === true
  }
}

// The title is derived from the snapshot on the way back in, so only a name the
// reader typed is worth storing.
const packTab = (tab, snapshot, diffSaved) => ({
  customTitle: str(tab.customTitle),
  entryId: str(tab.entryId, null) || null,
  diffSaved: !!diffSaved,
  snapshot
})

/**
 * The session to store, or null when there is nothing worth restoring.
 *
 * The active tab is packed from `live` rather than from its own snapshot: a
 * tab's copy is only refreshed when tabs switch, so the one you are looking at
 * is stale by definition while you work in it.
 * @param {import('./tabs').DiffTab[]} tabs
 * @param {string} activeId
 * @param {{ snapshot: object, diffSaved: boolean }} [live]
 */
export function packSession(tabs, activeId, live) {
  const kept = []
  let budget = MAX_SESSION_BYTES
  // A comparison left out is a comparison lost on the next launch, so the count
  // travels with the session rather than the tabs going quietly. A blank tab is
  // not a loss — there was nothing in it.
  let dropped = 0
  for (const tab of tabs ?? []) {
    const isLive = live && tab.id === activeId
    const snapshot = isLive ? live.snapshot : tab.snapshot
    if (isBlank({ snapshot })) continue
    const packed = packTab(tab, snapshot, isLive ? live.diffSaved : tab.diffSaved)
    const size = JSON.stringify(packed).length
    if (size > MAX_TAB_BYTES || size > budget) {
      dropped += 1
      continue
    }
    budget -= size
    kept.push({ ...packed, active: tab.id === activeId })
  }
  if (!kept.length) return null
  return { version: SESSION_VERSION, tabs: kept, dropped }
}

function readTab(raw) {
  const snapshot = raw && typeof raw === 'object' ? readSnapshot(raw.snapshot) : null
  if (!snapshot || isBlank({ snapshot })) return null
  return {
    customTitle: str(raw.customTitle),
    entryId: str(raw.entryId, null) || null,
    diffSaved: raw.diffSaved === true,
    active: raw.active === true,
    snapshot
  }
}

/**
 * Parse a decrypted session document. Anything unrecognised, corrupt or beyond
 * the tab ceiling gives null (or is dropped) rather than a half-built session.
 * @param {string} [text]
 * @returns {{ tabs: object[] }|null}
 */
export function readSession(text) {
  let parsed
  try {
    parsed = JSON.parse(String(text ?? ''))
  } catch {
    return null
  }
  if (!parsed || parsed.version !== SESSION_VERSION || !Array.isArray(parsed.tabs)) return null
  const tabs = parsed.tabs.map(readTab).filter(Boolean).slice(0, MAX_TABS)
  return tabs.length ? { tabs } : null
}

/**
 * The stored envelope around the ciphertext (the payload itself is sealed with
 * the vault key — see tabsStore.saveSession).
 * @param {string} [raw]
 * @returns {{ iv: string, data: string }|null}
 */
export function readEnvelope(raw) {
  let parsed
  try {
    parsed = JSON.parse(String(raw ?? ''))
  } catch {
    return null
  }
  if (!parsed || typeof parsed.iv !== 'string' || typeof parsed.data !== 'string') return null
  return { iv: parsed.iv, data: parsed.data }
}

// What "no session" looks like on disk: written when the last comparison is
// closed, so the next launch opens clean instead of on a stale one.
export const EMPTY_ENVELOPE = JSON.stringify({ version: SESSION_VERSION })

// The session file is sealed with the vault key, like a saved diff — it holds
// the same thing (whole file contents), so it is stored the same way. The AAD
// binds it to this store and shape, so a box lifted from anywhere else fails.
export const SESSION_AAD = 'session|v1'
