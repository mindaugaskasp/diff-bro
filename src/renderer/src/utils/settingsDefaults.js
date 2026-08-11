// Defaults, limits and the sanitizers that clamp a hand-edited settings file
// back into range. Pure data and pure functions — no store, so the clamping is
// testable on its own.
import { isLocale } from '../../../shared/i18n'
import { defaultQuickLookShortcut, migratedQuickLookShortcut } from '../../../shared/shortcuts'
import { isValidAccelerator } from './accelerator'
import { platformId } from '../keys'
import { MAX_RECENT_TOOLS } from './tools'
import { normalizeTheme } from './themes'

export const DEFAULT_QUICKLOOK_SHORTCUT = defaultQuickLookShortcut(platformId)

// Mirrors autoBackup.js's MIN/MAX_WINDOW_HOURS. Main clamps independently, so a
// hand-edited settings file cannot widen the window.
export const BACKUP_HOURS = [1, 3, 6, 12, 24]
export const clampBackupHours = (h) => {
  const n = Number(h)
  if (!Number.isFinite(n)) return 6
  return Math.min(Math.max(Math.round(n), BACKUP_HOURS[0]), BACKUP_HOURS.at(-1))
}

// Organizational, non-secret preferences, persisted as PLAINTEXT settings.json
// (nothing sensitive; encrypted data stays in the vault/snippet stores).

export const SECTIONS = ['saved', 'external', 'snippets', 'tools']

// Per-type soft "load anyway?" thresholds (`cap` is the enforced ceiling + slider
// max). Mirrored in src/main/files.js — keep in sync.
export const FILE_TYPE_LIMITS = {
  text: { label: 'Text & code', default: 10, cap: 200 },
  spreadsheet: { label: 'Spreadsheet (.xlsx)', default: 25, cap: 100 }
}

export const DEFAULT_MAX_SNIPPET_SIZE_KB = 512
// The sidebar tag shelf's depth. Two rows is the FLOOR as well as the default:
// diffs and snippets are what the sidebar is for, and an unbounded tag wall
// pushed them into a sliver. The ceiling can afford to be this generous because
// the strip's max-height (SavedDiffs.css) keeps the sections a slice of the
// column whatever is asked for — past it the chips scroll.
export const TAGS_PER_ROW = 4
export const MIN_TAG_ROWS = 2
export const MAX_TAG_ROWS = 24

export const MAX_SNIPPET_SIZE_KB_CAP = 8192

// How much diff a stitched export may cover, in SCREEN pixels of content — the
// same amount on every display, which a device-pixel ceiling would not be (it
// would cover half as much on a Retina screen as on a 1× one). The resulting
// PNG is this times the display scale. Past it the export stops and says it was
// cut short. Memory is bounded separately and only in main (stitchBitmap.js),
// which must not trust a renderer-driven capture loop.
export const DEFAULT_MAX_EXPORT_HEIGHT_PX = 8000
export const MAX_EXPORT_HEIGHT_PX_CAP = 12000
export const MIN_EXPORT_HEIGHT_PX = 1000

// What the snippet editor opens at before the user has resized it: tall enough
// for the name, its template row, tags, the syntax row and a usable editor
// without the body scrolling. `.dialog`'s max-height still caps it on a short
// window, which is why the row above it is one line rather than three.
export const DEFAULT_SNIPPET_DIALOG_SIZE = { width: 560, height: 680 }

// Bounds for a remembered dialog size, so a stale file can't restore an absurd box.
export const DIALOG_SIZE_MIN = { width: 320, height: 240 }
export const DIALOG_SIZE_MAX = { width: 3000, height: 3000 }

export function defaultFileLimits() {
  const out = {}
  for (const [type, spec] of Object.entries(FILE_TYPE_LIMITS)) out[type] = spec.default
  return out
}

export const DEFAULT_SETTINGS = {
  sectionOrder: [...SECTIONS],
  shelfOrder: {}, // { [sectionId]: [shelfId, …] }
  showShortcutBar: true,
  rotateThemeDaily: false,
  fileSizeLimitsMb: defaultFileLimits(),
  maxSnippetSizeKb: DEFAULT_MAX_SNIPPET_SIZE_KB,
  maxExportHeightPx: DEFAULT_MAX_EXPORT_HEIGHT_PX,
  dialogSizes: {}, // { [key]: { width, height } } from user drag-resizes
  maximizeDialogs: false,
  shutterSound: true,
  restoreSession: true,
  // On by default: the point is protection from corruption nobody sees coming.
  autoBackup: true,
  autoBackupHours: 6,
  examplesSeeded: false,
  // Global shortcut for the quick look-up launcher (Electron accelerator form).
  quickLookShortcut: DEFAULT_QUICKLOOK_SHORTCUT,
  quickLookShortcutMigrated: true,
  // Windows only, and ON: pressing X stores the window in the notification area
  // rather than ending the app, so the global shortcut survives it.
  closeToTray: true
}

export const clampNumber = (value, fallback, min, max) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

// Normalises to exactly the known sections, once each: unknown and repeated ids
// are dropped, and any section MISSING from a stored order is appended — which
// is what carries a settings file written before a new section existed, keeping
// the order the user dragged instead of resetting it.
export function sanitizeSectionOrder(order) {
  if (!Array.isArray(order)) return [...SECTIONS]
  const kept = order.filter((id, i) => SECTIONS.includes(id) && order.indexOf(id) === i)
  for (const id of SECTIONS) if (!kept.includes(id)) kept.push(id)
  return kept
}

// Clamped to each type's [1, cap]; migrates the pre-per-type maxComparisonFileMb
// into the text bucket.
export function readFileLimits(parsed) {
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
export function sanitizeSize(s) {
  if (!s || typeof s !== 'object') return null
  const width = clampNumber(s.width, null, DIALOG_SIZE_MIN.width, DIALOG_SIZE_MAX.width)
  const height = clampNumber(s.height, null, DIALOG_SIZE_MIN.height, DIALOG_SIZE_MAX.height)
  if (width == null || height == null) return null
  return { width, height }
}

export function readDialogSizes(parsed) {
  if (!parsed.dialogSizes || typeof parsed.dialogSizes !== 'object') return {}
  const out = {}
  for (const [key, val] of Object.entries(parsed.dialogSizes)) {
    const size = sanitizeSize(val)
    if (size) out[key] = size
  }
  return out
}

/**
 * The store's initial state, shaped and clamped from a hand-editable file. Pure:
 * the store does the reading, so every fallback here is testable without one.
 *
 * @param {object} parsed the persisted settings blob
 * @param {{ showShortcutBar: boolean, theme: unknown }} outside values kept
 *   under their own store keys rather than inside settings.json
 */
// One table, read on load and written by settingsStore.setLimit — three numbers
// with the same shape, so they cannot drift apart.
export const NUMERIC_LIMITS = {
  maxSnippetSizeKb: { default: DEFAULT_MAX_SNIPPET_SIZE_KB, min: 16, max: MAX_SNIPPET_SIZE_KB_CAP },
  maxExportHeightPx: {
    default: DEFAULT_MAX_EXPORT_HEIGHT_PX,
    min: MIN_EXPORT_HEIGHT_PX,
    max: MAX_EXPORT_HEIGHT_PX_CAP
  },
  tagShelfRows: { default: MIN_TAG_ROWS, min: MIN_TAG_ROWS, max: MAX_TAG_ROWS }
}

const readNumericLimits = (parsed) =>
  Object.fromEntries(
    Object.entries(NUMERIC_LIMITS).map(([name, spec]) => [
      name,
      clampNumber(parsed[name], spec.default, spec.min, spec.max)
    ])
  )

export function settingsStateFrom(parsed, outside) {
  return {
    sectionOrder: sanitizeSectionOrder(parsed.sectionOrder),
    shelfOrder:
      parsed.shelfOrder && typeof parsed.shelfOrder === 'object' ? { ...parsed.shelfOrder } : {},
    showShortcutBar: outside.showShortcutBar,
    rotateThemeDaily: parsed.rotateThemeDaily === true,
    fileSizeLimitsMb: readFileLimits(parsed),
    ...readNumericLimits(parsed),
    dialogSizes: readDialogSizes(parsed),
    maximizeDialogs: parsed.maximizeDialogs === true,
    // NULL until the user picks one: persist() writes every key, so defaulting
    // to 'en' here would bake it in the first time any setting is touched and
    // "follow the OS" would hold for exactly one session.
    locale: isLocale(parsed.locale) ? parsed.locale : null,
    // A sound the app makes on its own, so it is escapable; default on.
    shutterSound: parsed.shutterSound !== false,
    // Make room on a full tab strip by closing the oldest comparison. OFF by
    // default: the refusal it replaces exists because a comparison evicted
    // without being asked is work silently lost.
    autoCloseOldest: parsed.autoCloseOldest === true,
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
    // A hand-edited/invalid stored accelerator falls back to the default, and an
    // install still holding the old cross-platform default is moved off it once.
    quickLookShortcut: migratedQuickLookShortcut({
      stored: isValidAccelerator(parsed.quickLookShortcut) ? parsed.quickLookShortcut : null,
      migrated: parsed.quickLookShortcutMigrated,
      fallback: DEFAULT_QUICKLOOK_SHORTCUT
    }),
    // Set on first read and persisted, so the move above happens exactly once.
    quickLookShortcutMigrated: true,
    closeToTray: parsed.closeToTray !== false,
    userTheme: normalizeTheme(outside.theme),
    // The ACTIVE theme components read — userTheme, unless daily rotation is on.
    theme: normalizeTheme(outside.theme)
  }
}
