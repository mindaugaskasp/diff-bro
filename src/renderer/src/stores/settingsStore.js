import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../persist'
import { isValidAccelerator } from '../utils/accelerator'

// Default quick look-up shortcut: Cmd/Ctrl+Shift+Space on every platform. Two
// modifiers so it can't fire while typing capitals (the old macOS Shift+Space
// did). Mirrored in src/main/quickLook.js — keep the two in step.
export const DEFAULT_QUICKLOOK_SHORTCUT = 'CommandOrControl+Shift+Space'

// Organizational, non-secret preferences, persisted as PLAINTEXT settings.json
// (nothing sensitive; encrypted data stays in the vault/snippet stores).

export const SECTIONS = ['saved', 'external', 'snippets']

// Per-type soft "load anyway?" thresholds (`cap` is the enforced ceiling + slider
// max). Mirrored in src/main/files.js — keep in sync.
export const FILE_TYPE_LIMITS = {
  text: { label: 'Text & code', default: 10, cap: 200 },
  spreadsheet: { label: 'Spreadsheet (.xlsx)', default: 25, cap: 100 }
}

export const DEFAULT_MAX_SNIPPET_SIZE_KB = 512
export const MAX_SNIPPET_SIZE_KB_CAP = 8192

// Bounds for a remembered dialog size, so a stale file can't restore an absurd box.
export const DIALOG_SIZE_MIN = { width: 320, height: 240 }
export const DIALOG_SIZE_MAX = { width: 3000, height: 3000 }

function defaultFileLimits() {
  const out = {}
  for (const [type, spec] of Object.entries(FILE_TYPE_LIMITS)) out[type] = spec.default
  return out
}

export const DEFAULT_SETTINGS = {
  sectionOrder: [...SECTIONS],
  sectionsLocked: false,
  shelfOrder: {}, // { [sectionId]: [shelfId, …] }
  showShortcutBar: true,
  rotateThemeDaily: false,
  fileSizeLimitsMb: defaultFileLimits(),
  maxSnippetSizeKb: DEFAULT_MAX_SNIPPET_SIZE_KB,
  dialogSizes: {}, // { [key]: { width, height } } from user drag-resizes
  maximizeDialogs: false,
  examplesSeeded: false,
  // Global shortcut for the quick look-up launcher (Electron accelerator form).
  quickLookShortcut: DEFAULT_QUICKLOOK_SHORTCUT
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

// Clamped to each type's [1, cap]; migrates the pre-per-type maxComparisonFileMb
// into the text bucket.
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

// Only honoured when both dimensions are finite and in-bounds; else dropped.
function sanitizeSize(s) {
  if (!s || typeof s !== 'object') return null
  const width = clampNumber(s.width, null, DIALOG_SIZE_MIN.width, DIALOG_SIZE_MAX.width)
  const height = clampNumber(s.height, null, DIALOG_SIZE_MIN.height, DIALOG_SIZE_MAX.height)
  if (width == null || height == null) return null
  return { width, height }
}

function readDialogSizes(parsed) {
  if (!parsed.dialogSizes || typeof parsed.dialogSizes !== 'object') return {}
  const out = {}
  for (const [key, val] of Object.entries(parsed.dialogSizes)) {
    const size = sanitizeSize(val)
    if (size) out[key] = size
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
    dialogSizes: readDialogSizes(parsed),
    maximizeDialogs: parsed.maximizeDialogs === true,
    examplesSeeded: parsed.examplesSeeded === true,
    // A hand-edited/invalid stored accelerator falls back to the default.
    quickLookShortcut: isValidAccelerator(parsed.quickLookShortcut)
      ? parsed.quickLookShortcut
      : DEFAULT_QUICKLOOK_SHORTCUT
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => readState(),
  getters: {
    // Sections in the user's chosen order (always all three, sanitized).
    orderedSections: (s) => s.sectionOrder,
    maxSnippetSizeBytes: (s) => s.maxSnippetSizeKb * 1024,
    // The remembered size for a resizable dialog, or null for its default.
    dialogSize: (s) => (key) => s.dialogSizes[key] ?? null,
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
          dialogSizes: this.dialogSizes,
          maximizeDialogs: this.maximizeDialogs,
          examplesSeeded: this.examplesSeeded,
          quickLookShortcut: this.quickLookShortcut
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
    setMaximizeDialogs(value) {
      this.maximizeDialogs = !!value
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
    // Remember a resizable dialog's size after a user drag-resize, keyed by a
    // stable dialog id. Bounds are clamped here too, so a bogus value can never
    // reach persistence.
    setDialogSize(key, size) {
      const clamped = sanitizeSize(size)
      if (!clamped) return
      this.dialogSizes = { ...this.dialogSizes, [key]: clamped }
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
    },
    // Persist the quick look-up accelerator. Rejects anything structurally
    // invalid so a bad value can't reach settings.json (the main process still
    // guards its own registration). Returns whether it was accepted.
    setQuickLookShortcut(accel) {
      if (!isValidAccelerator(accel)) return false
      this.quickLookShortcut = accel
      this.persist()
      return true
    }
  }
})
