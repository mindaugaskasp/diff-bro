// Tab bookkeeping for the comparison area. Pure: a tab is an id, a title, and
// the diffStore snapshot that IS the document (see diffStore.snapshot()), so
// nothing here needs Vue, the store, or Monaco. What a tab COSTS lives in
// tabCost.js — accounting, not identity.
export { MAX_TABS, MAX_LIVE_CHARS, tabCost, tabsCost, canAddTab } from './tabCost'

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

// What an empty comparison calls itself.
export const UNTITLED = 'Untitled'

const sideName = (file, pasteFile) => file?.name || pasteFile?.name || ''
const hasPastedText = (s) => s?.mode === 'paste' && !!(s.pasteLeft || s.pasteRight)

// Both pasted sides carry the same placeholder, so every paste tab read
// "Left (pasted) ↔ Right (…". The first line pasted is what a reader knows.
const PASTED_PLACEHOLDER = /^(Left|Right) \(pasted\)$/
const isPasted = (file) => !file?.path && PASTED_PLACEHOLDER.test(file?.name ?? '')
const FIRST_LINE_MAX = 24

// "First non-empty line" titled a JSON tab with a single bracket: a line has
// to carry a letter or a digit before it can name anything.
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

/** A typed tab name, tidied — or '' to mean "go back to the derived one". */
// Unicode letters, never ASCII \w: the app is localised, and \w would make a
// Lithuanian or Japanese tab name unwritable.
const NOT_A_NAME = /[^\p{L}\p{M}\p{N}_ -]+/gu

export const cleanTabName = (name) =>
  String(name ?? '')
    .replace(NOT_A_NAME, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAB_NAME)

/** What the bar shows: a typed name outranks the one derived from the files. */
export const tabLabel = (tab) => tab?.customTitle || tab?.title || UNTITLED

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
 * The tab one step along the strip, or null at either end. Unlike step(), which
 * cycles, this is for a control that disables itself when there is nowhere to
 * go.
 * @param {DiffTab[]} tabs
 * @param {string} activeId
 * @param {1|-1} delta
 * @returns {string|null}
 */
export function adjacentTabId(tabs, activeId, delta) {
  const list = tabs ?? []
  const i = list.findIndex((t) => t.id === activeId)
  if (i === -1) return null
  return list[i + delta]?.id ?? null
}

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
 * Which tab to show once a whole SET goes. Same convention as nextActiveId —
 * right, then left — but resolved against every survivor at once, so a bulk
 * close lands somewhere real instead of hopping through the tabs it is
 * removing.
 * @param {DiffTab[]} tabs   before the close
 * @param {string[]} closingIds
 * @param {string} activeId
 * @returns {string|null}    null when nothing survives
 */
export function nextActiveIdAfterClosing(tabs, closingIds, activeId) {
  const list = tabs ?? []
  const closing = new Set(closingIds ?? [])
  if (!list.some((t) => !closing.has(t.id))) return null
  if (!closing.has(activeId)) return activeId
  const from = list.findIndex((t) => t.id === activeId)
  for (let i = from + 1; i < list.length; i++) if (!closing.has(list[i].id)) return list[i].id
  for (let i = from - 1; i >= 0; i--) if (!closing.has(list[i].id)) return list[i].id
  return null
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

// A real state to be IN, but not one to come back to: after a restart the
// waiting slot has no memory of what you were about to pick.
export const isHalfLoaded = (tab) => {
  const s = tab?.snapshot
  return !!s && !s.left !== !s.right
}

// The abandoned drop cleared and NOTHING else: paste text, the mode and the
// view toggles are the user's own work, and blanking threw them away.
export const withoutFileSlots = (snapshot) => ({ ...snapshot, left: null, right: null })

// An object, not destructuring defaults: tabsStore.open() sits on the
// complexity limit and every `=` in a signature counts.
export const OPEN_DEFAULTS = {
  diffSaved: false,
  entryId: null,
  reuseBlank: true,
  name: '',
  transient: false
}
