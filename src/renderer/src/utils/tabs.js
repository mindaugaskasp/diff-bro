// Tab bookkeeping for the comparison area. Pure: a tab is an id, a title, and
// the diffStore snapshot that IS the document (see diffStore.snapshot()), so
// nothing here needs Vue, the store, or Monaco.

// Each tab holds both sides' full contents, so this is a memory bound, not a
// taste one. Only the active tab has Monaco models; the rest are plain text.
export const MAX_TABS = 6

let seq = 0
const nextId = () => `tab-${++seq}`

/**
 * An empty comparison, spelled out rather than left as `{}` so restore() never
 * has to turn missing fields into nulls and a fresh tab is a real document.
 * View toggles carry over — a new tab should not undo the split-view choice.
 * @param {{ renderSideBySide?: boolean, ignoreTrimWhitespace?: boolean }} [view]
 */
export const blankSnapshot = (view = {}) => ({
  mode: 'files',
  left: null,
  right: null,
  pasteLeft: '',
  pasteRight: '',
  pasteLeftFile: null,
  pasteRightFile: null,
  pasteLeftName: '',
  pasteRightName: '',
  renderSideBySide: view.renderSideBySide ?? true,
  ignoreTrimWhitespace: view.ignoreTrimWhitespace ?? false,
  semanticView: false
})

/**
 * @typedef {object} DiffTab
 * @property {string} id
 * @property {string} title        derived from the snapshot, kept in step with it
 * @property {string} [customTitle] a name typed by the reader; wins over `title`
 * @property {import('../types').DiffSnapshot} snapshot
 * @property {boolean} diffSaved  whether this comparison is already in the vault
 * @property {boolean} [transient] git handed this one over; both sides are
 *                     throwaway copies, so it may be recycled when tabs run out
 */

/**
 * What the tab calls itself. Falls back through the states a comparison passes
 * through so a tab is never blank while it is being filled in.
 * @param {object} [snapshot]
 * @returns {string}
 */
// What an empty comparison calls itself.
export const UNTITLED = 'Untitled'

const sideName = (file, pasteFile) => file?.name || pasteFile?.name || ''
const hasPastedText = (s) => s?.mode === 'paste' && !!(s.pasteLeft || s.pasteRight)

// Comparing pasted text names BOTH sides with the same placeholder, so every
// paste tab came out reading "Left (pasted) ↔ Right (…" — identical, truncated,
// and useless for telling three of them apart. The first line of what was
// pasted is the thing a reader actually recognises.
const PASTED_PLACEHOLDER = /^(Left|Right) \(pasted\)$/
const isPasted = (file) => !file?.path && PASTED_PLACEHOLDER.test(file?.name ?? '')
const FIRST_LINE_MAX = 24

// Pretty-printed JSON opens on "[" or "{" and YAML on "---", so "the first
// non-empty line" titled the tab with a single bracket. A line has to carry a
// letter or a digit before it can name anything.
const SAYS_SOMETHING = /[\p{L}\p{N}]/u

export function firstLineOf(content) {
  const line = String(content ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => SAYS_SOMETHING.test(l))
  if (!line) return ''
  return line.length > FIRST_LINE_MAX ? `${line.slice(0, FIRST_LINE_MAX - 1)}…` : line
}

const pastedTitle = (s) =>
  firstLineOf(s.left.content) || firstLineOf(s.right.content) || 'Pasted text'

export function tabTitle(snapshot) {
  const s = snapshot ?? {}
  if (isPasted(s.left) && isPasted(s.right)) return pastedTitle(s)
  const left = sideName(s.left, s.pasteLeftFile)
  const right = sideName(s.right, s.pasteRightFile)
  if (left && right) return `${left} ↔ ${right}`
  return left || right || (hasPastedText(s) ? 'Pasted text' : UNTITLED)
}

/**
 * @param {object} [snapshot]
 * @param {{ diffSaved?: boolean }} [opts]
 * @returns {DiffTab}
 */
export function createTab(
  snapshot = blankSnapshot(),
  { diffSaved = false, transient = false } = {}
) {
  return { id: nextId(), title: tabTitle(snapshot), snapshot, diffSaved, transient }
}

// Long enough for "prod vs staging", short enough not to overrun the bar.
export const MAX_TAB_NAME = 40

/**
 * A typed tab name, tidied — or '' to mean "go back to the derived one".
 * @param {string} [name]
 * @returns {string}
 */
export const cleanTabName = (name) =>
  String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAB_NAME)

/**
 * What the bar shows. A name the reader typed outranks the one derived from the
 * files, which keeps following the snapshot underneath it.
 * @param {DiffTab} [tab]
 * @returns {string}
 */
export const tabLabel = (tab) => tab?.customTitle || tab?.title || UNTITLED

/** @param {DiffTab[]} tabs */
export const canAddTab = (tabs) => (tabs?.length ?? 0) < MAX_TABS

/**
 * The tab a git-handed comparison may take over when there is no free one: the
 * oldest holding another git comparison, never the one being looked at.
 * @param {DiffTab[]} tabs
 * @param {string} activeId
 * @returns {DiffTab|null}
 */
export const recyclableTab = (tabs, activeId) =>
  (tabs ?? []).find((t) => t.transient && t.id !== activeId) ?? null

/**
 * Which tab to show once `closingId` goes. Closing the tab you are looking at
 * moves right, then left — the editor convention, and it never lands on a tab
 * that is itself about to disappear.
 * @param {DiffTab[]} tabs   before the close
 * @param {string} closingId
 * @param {string} activeId
 * @returns {string|null}    null when nothing is left
 */
export function nextActiveId(tabs, closingId, activeId) {
  const list = tabs ?? []
  if (closingId !== activeId) return list.some((t) => t.id === activeId) ? activeId : null
  const i = list.findIndex((t) => t.id === closingId)
  if (i === -1) return activeId
  return list[i + 1]?.id ?? list[i - 1]?.id ?? null
}

/**
 * A tab with the same comparison already open, so the sidebar focuses it
 * instead of stacking duplicates.
 * @param {DiffTab[]} tabs
 * @param {string} entryId  saved-diff id
 * @returns {DiffTab|undefined}
 */
export const tabForEntry = (tabs, entryId) =>
  entryId ? (tabs ?? []).find((t) => t.entryId === entryId) : undefined

/**
 * True when a tab holds nothing worth keeping, so opening a comparison can
 * reuse it rather than leaving an empty tab behind.
 * @param {DiffTab} [tab]
 * @returns {boolean}
 */
export function isBlank(tab) {
  const s = tab?.snapshot
  if (!s) return true
  return (
    !s.left && !s.right && !s.pasteLeft && !s.pasteRight && !s.pasteLeftFile && !s.pasteRightFile
  )
}
