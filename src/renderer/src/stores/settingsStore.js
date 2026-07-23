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

// Comparison-file size limits, PER FILE TYPE. Each is a soft "load anyway?"
// prompt threshold the user can raise, and `cap` is the hard ceiling the app
// enforces (also the slider max). Different types degrade differently: Monaco
// gets sluggish with large text well before a .xlsx (compressed, and the grid
// only renders a capped window), so their sensible middle grounds differ. Add a
// new type here (e.g. `docx`) and the Settings pane + main-process guard both
// pick it up. Main mirrors these numbers in src/main/files.js (it can't import a
// Pinia store) — keep the two in sync.
export const FILE_TYPE_LIMITS = {
  text: { label: 'Text & code', default: 10, cap: 200 },
  spreadsheet: { label: 'Spreadsheet (.xlsx)', default: 25, cap: 100 }
}

// Snippet size guard: user-raisable with a hard ceiling, same rationale.
export const DEFAULT_MAX_SNIPPET_SIZE_KB = 512
export const MAX_SNIPPET_SIZE_KB_CAP = 8192

function defaultFileLimits() {
  const out = {}
  for (const [type, spec] of Object.entries(FILE_TYPE_LIMITS)) out[type] = spec.default
  return out
}

export const DEFAULT_SETTINGS = {
  sectionOrder: [...SECTIONS],
  // Freezes section reordering (both the drag-and-drop and the up/down controls)
  // so a settled sidebar layout can't be nudged by accident.
  sectionsLocked: false,
  // { [sectionId]: [shelfId, …] } — a section absent here uses its natural order.
  shelfOrder: {},
  showShortcutBar: true,
  // Fun: pick a new random theme each day (overrides the Appearance choice while
  // on; turning it off reverts to that choice). Off by default.
  rotateThemeDaily: false,
  fileSizeLimitsMb: defaultFileLimits(),
  maxSnippetSizeKb: DEFAULT_MAX_SNIPPET_SIZE_KB,
  // Whether the one-time first-run example snippet decision has been made (see
  // App.vue). Recorded for everyone once, so the example is never re-seeded.
  examplesSeeded: false
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

// Resolve each type's limit from the stored map, migrating the pre-per-type
// single `maxComparisonFileMb` into the text bucket. Every value is clamped to
// its type's [1, cap], so a stale or hand-edited file can't exceed the ceiling.
function readFileLimits(parsed) {
  const stored =
    parsed.fileSizeLimitsMb && typeof parsed.fileSizeLimitsMb === 'object'
      ? parsed.fileSizeLimitsMb
      : {}
  const legacy = Number(parsed.maxComparisonFileMb)
  const out = {}
  for (const [type, spec] of Object.entries(FILE_TYPE_LIMITS)) {
    const legacySeed = type === 'text' && Number.isFinite(legacy) ? legacy : spec.default
    const raw = stored[type] ?? legacySeed
    out[type] = clampNumber(raw, spec.default, 1, spec.cap)
  }
  return out
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
    sectionsLocked: parsed.sectionsLocked === true,
    shelfOrder:
      parsed.shelfOrder && typeof parsed.shelfOrder === 'object' ? { ...parsed.shelfOrder } : {},
    showShortcutBar,
    rotateThemeDaily: parsed.rotateThemeDaily === true,
    fileSizeLimitsMb: readFileLimits(parsed),
    maxSnippetSizeKb: clampNumber(
      parsed.maxSnippetSizeKb,
      DEFAULT_MAX_SNIPPET_SIZE_KB,
      16,
      MAX_SNIPPET_SIZE_KB_CAP
    ),
    examplesSeeded: parsed.examplesSeeded === true
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => readState(),
  getters: {
    // Sections in the user's chosen order (always all three, sanitized).
    orderedSections: (s) => s.sectionOrder,
    maxSnippetSizeBytes: (s) => s.maxSnippetSizeKb * 1024,
    // The configured MB limit for a file type (falls back to its default).
    fileSizeLimitMb: (s) => (type) =>
      s.fileSizeLimitsMb[type] ?? FILE_TYPE_LIMITS[type]?.default ?? 10,
    fileSizeLimitBytes() {
      return (type) => this.fileSizeLimitMb(type) * 1024 * 1024
    }
  },
  actions: {
    persist() {
      savePersisted(
        'settings',
        JSON.stringify({
          sectionOrder: this.sectionOrder,
          sectionsLocked: this.sectionsLocked,
          shelfOrder: this.shelfOrder,
          showShortcutBar: this.showShortcutBar,
          rotateThemeDaily: this.rotateThemeDaily,
          fileSizeLimitsMb: this.fileSizeLimitsMb,
          // Legacy mirror: an older build (or main's fallback) still honours the
          // text limit through the pre-per-type key.
          maxComparisonFileMb: this.fileSizeLimitsMb.text,
          maxSnippetSizeKb: this.maxSnippetSizeKb,
          examplesSeeded: this.examplesSeeded
        })
      )
    },
    // Record that the one-time first-run example decision has been made.
    markExamplesSeeded() {
      if (this.examplesSeeded) return
      this.examplesSeeded = true
      this.persist()
    },
    // Move a section one step up or down (delta -1 / +1). No-op at the ends.
    moveSection(id, delta) {
      if (this.sectionsLocked) return
      const order = [...this.sectionOrder]
      const from = order.indexOf(id)
      const to = from + delta
      if (from === -1 || to < 0 || to >= order.length) return
      order.splice(to, 0, order.splice(from, 1)[0])
      this.sectionOrder = order
      this.persist()
    },
    // Drag-and-drop reorder: drop section `fromId` so it lands just before
    // `toId`. No-op when locked or when either id is unknown.
    reorderSections(fromId, toId) {
      if (this.sectionsLocked || fromId === toId) return
      if (!this.sectionOrder.includes(fromId) || !this.sectionOrder.includes(toId)) return
      const order = this.sectionOrder.filter((id) => id !== fromId)
      order.splice(order.indexOf(toId), 0, fromId)
      this.sectionOrder = order
      this.persist()
    },
    toggleSectionsLock() {
      this.sectionsLocked = !this.sectionsLocked
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
    setRotateThemeDaily(value) {
      this.rotateThemeDaily = !!value
      this.persist()
    },
    setFileSizeLimitMb(type, value) {
      const spec = FILE_TYPE_LIMITS[type]
      if (!spec) return
      this.fileSizeLimitsMb = {
        ...this.fileSizeLimitsMb,
        [type]: clampNumber(value, spec.default, 1, spec.cap)
      }
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
