// Defaults, limits and the sanitizers that clamp a hand-edited settings file
// back into range. Pure data and pure functions — no store, so the clamping is
// testable on its own.

export const DEFAULT_QUICKLOOK_SHORTCUT = 'CommandOrControl+Shift+Space'

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

export const SECTIONS = ['saved', 'external', 'snippets']

// Per-type soft "load anyway?" thresholds (`cap` is the enforced ceiling + slider
// max). Mirrored in src/main/files.js — keep in sync.
export const FILE_TYPE_LIMITS = {
  text: { label: 'Text & code', default: 10, cap: 200 },
  spreadsheet: { label: 'Spreadsheet (.xlsx)', default: 25, cap: 100 }
}

export const DEFAULT_MAX_SNIPPET_SIZE_KB = 512
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
  sectionsLocked: false,
  shelfOrder: {}, // { [sectionId]: [shelfId, …] }
  showShortcutBar: true,
  rotateThemeDaily: false,
  fileSizeLimitsMb: defaultFileLimits(),
  maxSnippetSizeKb: DEFAULT_MAX_SNIPPET_SIZE_KB,
  maxExportHeightPx: DEFAULT_MAX_EXPORT_HEIGHT_PX,
  dialogSizes: {}, // { [key]: { width, height } } from user drag-resizes
  maximizeDialogs: false,
  shutterSound: true,
  // 'auto' pairs diagrams to the app's ground; 'light'/'dark' pin them.
  diagramTheme: 'auto',
  restoreSession: true,
  // On by default: the point is protection from corruption nobody sees coming.
  autoBackup: true,
  autoBackupHours: 6,
  examplesSeeded: false,
  // Global shortcut for the quick look-up launcher (Electron accelerator form).
  quickLookShortcut: DEFAULT_QUICKLOOK_SHORTCUT
}

export const clampNumber = (value, fallback, min, max) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

// A section order is only valid if it is exactly the known sections, once each
// — otherwise a stale or corrupt file could hide a section entirely.
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
