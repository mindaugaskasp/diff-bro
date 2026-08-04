import { defineStore } from 'pinia'
import { loadPersisted, savePersisted } from '../persist'
import { isValidAccelerator } from '../utils/accelerator'
import { MAX_RECENT_TOOLS, noteRecent } from '../utils/tools'
import { isDiagramTheme } from '../utils/mermaid'
import { applyTheme, isDarkTheme, normalizeTheme, themeForDay } from '../utils/themes'
import {
  BACKUP_HOURS,
  DIALOG_SIZE_MAX,
  DIALOG_SIZE_MIN,
  DEFAULT_MAX_EXPORT_HEIGHT_PX,
  DEFAULT_MAX_SNIPPET_SIZE_KB,
  DEFAULT_QUICKLOOK_SHORTCUT,
  DEFAULT_SETTINGS,
  FILE_TYPE_LIMITS,
  MAX_EXPORT_HEIGHT_PX_CAP,
  MAX_SNIPPET_SIZE_KB_CAP,
  MIN_EXPORT_HEIGHT_PX,
  SECTIONS,
  clampBackupHours,
  clampNumber,
  readDialogSizes,
  readFileLimits,
  sanitizeSectionOrder,
  sanitizeSize
} from '../utils/settingsDefaults'

// Re-exported so the many modules that already import these from the store keep
// working; the definitions live in utils/settingsDefaults.js.
export {
  BACKUP_HOURS,
  DEFAULT_MAX_EXPORT_HEIGHT_PX,
  DEFAULT_MAX_SNIPPET_SIZE_KB,
  DEFAULT_QUICKLOOK_SHORTCUT,
  DEFAULT_SETTINGS,
  DIALOG_SIZE_MAX,
  DIALOG_SIZE_MIN,
  FILE_TYPE_LIMITS,
  MAX_EXPORT_HEIGHT_PX_CAP,
  MAX_SNIPPET_SIZE_KB_CAP,
  MIN_EXPORT_HEIGHT_PX,
  SECTIONS
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
    maxExportHeightPx: clampNumber(
      parsed.maxExportHeightPx,
      DEFAULT_MAX_EXPORT_HEIGHT_PX,
      MIN_EXPORT_HEIGHT_PX,
      MAX_EXPORT_HEIGHT_PX_CAP
    ),
    dialogSizes: readDialogSizes(parsed),
    maximizeDialogs: parsed.maximizeDialogs === true,
    // A sound the app makes on its own, so it is escapable; default on.
    shutterSound: parsed.shutterSound !== false,
    diagramTheme: isDiagramTheme(parsed.diagramTheme) ? parsed.diagramTheme : 'auto',
    // Reopen the comparisons that were open at quit. On by default; turning it
    // off forgets the stored one too (see tabsStore.setRestoreSession).
    restoreSession: parsed.restoreSession !== false,
    autoBackup: parsed.autoBackup !== false,
    // The sidebar collapsed to its rail. Off by default: the library is how a
    // comparison is usually reached.
    sidebarCollapsed: parsed.sidebarCollapsed === true,
    autoBackupHours: clampBackupHours(parsed.autoBackupHours),
    examplesSeeded: parsed.examplesSeeded === true,
    // Most-recent-first tool ids; unknown ids are dropped when rendered.
    recentTools: Array.isArray(parsed.recentTools)
      ? parsed.recentTools.filter((id) => typeof id === 'string').slice(0, MAX_RECENT_TOOLS)
      : [],
    // A hand-edited/invalid stored accelerator falls back to the default.
    quickLookShortcut: isValidAccelerator(parsed.quickLookShortcut)
      ? parsed.quickLookShortcut
      : DEFAULT_QUICKLOOK_SHORTCUT,
    // Persisted under its own key since long before the settings blob existed.
    userTheme: normalizeTheme(loadPersisted('theme')),
    // The ACTIVE theme components read — userTheme, unless daily rotation is on.
    theme: normalizeTheme(loadPersisted('theme'))
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
    initTheme() {
      this.resolveActiveTheme()
    },
    // Idempotent, so calling on focus rolls the daily theme over at midnight.
    resolveActiveTheme() {
      this.theme = this.rotateThemeDaily ? themeForDay() : this.userTheme
      applyTheme(this.theme)
    },
    // Select any of the named themes (Settings picker). Unknown ids fall back
    // to the default rather than leaving the app unstyled.
    setTheme(id) {
      this.userTheme = normalizeTheme(id)
      savePersisted('theme', this.userTheme)
      // While rotating, the pick is saved for later but the active theme stays
      // the day's; otherwise it applies immediately.
      this.resolveActiveTheme()
    },
    // Quick light/dark flip for the View menu + Ctrl+D: flips the ground, so a
    // dark-ground theme (Dark, Neon) goes Light and a light-ground one goes Dark.
    toggleTheme() {
      this.setTheme(isDarkTheme(this.userTheme) ? 'light' : 'dark')
    },
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
          maxExportHeightPx: this.maxExportHeightPx,
          dialogSizes: this.dialogSizes,
          maximizeDialogs: this.maximizeDialogs,
          shutterSound: this.shutterSound,
          diagramTheme: this.diagramTheme,
          restoreSession: this.restoreSession,
          autoBackup: this.autoBackup,
          sidebarCollapsed: this.sidebarCollapsed,
          autoBackupHours: this.autoBackupHours,
          examplesSeeded: this.examplesSeeded,
          recentTools: this.recentTools,
          quickLookShortcut: this.quickLookShortcut
        })
      )
    },
    // Drives the sidebar shelf's recent chips and the palette's Recent section.
    noteToolUsed(id) {
      const next = noteRecent(this.recentTools, id)
      if (next.join() === this.recentTools.join()) return
      this.recentTools = next
      this.persist()
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
    setShutterSound(value) {
      this.shutterSound = !!value
      this.persist()
    },
    setDiagramTheme(value) {
      this.diagramTheme = isDiagramTheme(value) ? value : 'auto'
      this.persist()
    },
    setAutoBackup(value) {
      this.autoBackup = value === true
      this.persist()
    },
    setAutoBackupHours(hours) {
      this.autoBackupHours = clampBackupHours(hours)
      this.persist()
    },
    setSidebarCollapsed(value) {
      this.sidebarCollapsed = value === true
      this.persist()
    },
    setRestoreSession(value) {
      this.restoreSession = !!value
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
    setMaxExportHeightPx(value) {
      this.maxExportHeightPx = clampNumber(
        value,
        DEFAULT_MAX_EXPORT_HEIGHT_PX,
        MIN_EXPORT_HEIGHT_PX,
        MAX_EXPORT_HEIGHT_PX_CAP
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
