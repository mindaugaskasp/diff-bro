import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../persist'

// User preferences that are organizational, not secret — section order, shelf
// order, UI toggles, and the size guards. Persisted as PLAINTEXT JSON in the
// data directory (settings.json) on purpose: it holds nothing sensitive, and
// keeping it human-readable leaves the door open to editing it by hand (or, one
// day, exposing more of it in the UI). Everything encrypted stays in the vault
// and snippet stores.

// The three reorderable sidebar sections, in their default top-to-bottom order.
export const SECTIONS = ['saved', 'external', 'snippets']

// Safe defaults that keep the app responsive. Both are user-raisable (the point
// of exposing them), but each has a hard ceiling so a typo can't wedge the app
// trying to diff or render something enormous.
export const DEFAULT_MAX_COMPARISON_FILE_MB = 10
export const DEFAULT_MAX_SNIPPET_SIZE_KB = 512
export const MAX_COMPARISON_FILE_MB_CAP = 500
export const MAX_SNIPPET_SIZE_KB_CAP = 8192

export const DEFAULT_SETTINGS = {
  sectionOrder: [...SECTIONS],
  // { [sectionId]: [shelfId, …] } — a section absent here uses its natural order.
  shelfOrder: {},
  showShortcutBar: true,
  maxComparisonFileMb: DEFAULT_MAX_COMPARISON_FILE_MB,
  maxSnippetSizeKb: DEFAULT_MAX_SNIPPET_SIZE_KB
}

const clampNumber = (value, fallback, min, max) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

// A section order is only valid if it is exactly the known sections, once each
// — otherwise a stale or corrupt file could hide a section entirely.
function sanitizeSectionOrder(order) {
  if (!Array.isArray(order)) return [...SECTIONS]
  const kept = order.filter((id, i) => SECTIONS.includes(id) && order.indexOf(id) === i)
  for (const id of SECTIONS) if (!kept.includes(id)) kept.push(id)
  return kept
}

function readState() {
  let parsed
  try {
    parsed = JSON.parse(loadPersisted('settings') ?? '{}') || {}
  } catch {
    parsed = {}
  }
  // One-time migration of the shortcut bar's old localStorage dismissal.
  let showShortcutBar = parsed.showShortcutBar
  if (typeof showShortcutBar !== 'boolean') {
    showShortcutBar = localStorage.getItem('diffbro.shortcutBarDismissed') !== '1'
  }
  return {
    sectionOrder: sanitizeSectionOrder(parsed.sectionOrder),
    shelfOrder:
      parsed.shelfOrder && typeof parsed.shelfOrder === 'object' ? { ...parsed.shelfOrder } : {},
    showShortcutBar,
    maxComparisonFileMb: clampNumber(
      parsed.maxComparisonFileMb,
      DEFAULT_MAX_COMPARISON_FILE_MB,
      1,
      MAX_COMPARISON_FILE_MB_CAP
    ),
    maxSnippetSizeKb: clampNumber(
      parsed.maxSnippetSizeKb,
      DEFAULT_MAX_SNIPPET_SIZE_KB,
      16,
      MAX_SNIPPET_SIZE_KB_CAP
    )
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => readState(),
  getters: {
    // Sections in the user's chosen order (always all three, sanitized).
    orderedSections: (s) => s.sectionOrder,
    maxSnippetSizeBytes: (s) => s.maxSnippetSizeKb * 1024
  },
  actions: {
    persist() {
      savePersisted(
        'settings',
        JSON.stringify({
          sectionOrder: this.sectionOrder,
          shelfOrder: this.shelfOrder,
          showShortcutBar: this.showShortcutBar,
          maxComparisonFileMb: this.maxComparisonFileMb,
          maxSnippetSizeKb: this.maxSnippetSizeKb
        })
      )
    },
    // Move a section one step up or down (delta -1 / +1). No-op at the ends.
    moveSection(id, delta) {
      const order = [...this.sectionOrder]
      const from = order.indexOf(id)
      const to = from + delta
      if (from === -1 || to < 0 || to >= order.length) return
      order.splice(to, 0, order.splice(from, 1)[0])
      this.sectionOrder = order
      this.persist()
    },
    // Persist the shelf order for a section (item drag-reorder). ids is the full
    // ordered list of that section's shelf ids.
    setShelfOrder(sectionId, ids) {
      this.shelfOrder = { ...this.shelfOrder, [sectionId]: [...ids] }
      this.persist()
    },
    // Return the stored shelf order for a section, reconciled against the shelves
    // that actually exist now: known ids first in stored order, then any new
    // shelf appended so nothing is ever dropped.
    shelfOrderFor(sectionId, presentIds) {
      const stored = this.shelfOrder[sectionId] ?? []
      const kept = stored.filter((id) => presentIds.includes(id))
      for (const id of presentIds) if (!kept.includes(id)) kept.push(id)
      return kept
    },
    setShowShortcutBar(value) {
      this.showShortcutBar = !!value
      this.persist()
    },
    setMaxComparisonFileMb(value) {
      this.maxComparisonFileMb = clampNumber(
        value,
        DEFAULT_MAX_COMPARISON_FILE_MB,
        1,
        MAX_COMPARISON_FILE_MB_CAP
      )
      this.persist()
    },
    setMaxSnippetSizeKb(value) {
      this.maxSnippetSizeKb = clampNumber(
        value,
        DEFAULT_MAX_SNIPPET_SIZE_KB,
        16,
        MAX_SNIPPET_SIZE_KB_CAP
      )
      this.persist()
    }
  }
})
