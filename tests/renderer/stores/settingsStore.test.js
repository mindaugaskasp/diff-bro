import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useSettingsStore,
  SECTIONS,
  FILE_TYPE_LIMITS,
  MAX_SNIPPET_SIZE_KB_CAP,
  DEFAULT_MAX_EXPORT_HEIGHT_PX,
  MAX_EXPORT_HEIGHT_PX_CAP,
  MIN_EXPORT_HEIGHT_PX
} from '../../../src/renderer/src/stores/settingsStore'
import { MAX_RECENT_TOOLS, recentTools } from '../../../src/renderer/src/utils/tools'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('settingsStore', () => {
  it('starts from safe defaults', () => {
    const s = useSettingsStore()
    expect(s.sectionOrder).toEqual(SECTIONS)
    expect(s.showShortcutBar).toBe(true)
    expect(s.fileSizeLimitMb('text')).toBe(FILE_TYPE_LIMITS.text.default)
    expect(s.fileSizeLimitMb('spreadsheet')).toBe(FILE_TYPE_LIMITS.spreadsheet.default)
    expect(s.fileSizeLimitBytes('spreadsheet')).toBe(
      FILE_TYPE_LIMITS.spreadsheet.default * 1024 * 1024
    )
    expect(s.maxSnippetSizeKb).toBeGreaterThan(0)
  })

  it('moves a section up and down, clamping at the ends', () => {
    const s = useSettingsStore()
    s.moveSection('snippets', -1)
    expect(s.sectionOrder).toEqual(['saved', 'snippets', 'external'])
    s.moveSection('saved', -1) // already first — no-op
    expect(s.sectionOrder).toEqual(['saved', 'snippets', 'external'])
    s.moveSection('saved', 1)
    expect(s.sectionOrder).toEqual(['snippets', 'saved', 'external'])
  })

  it('persists section order across store re-creation', () => {
    useSettingsStore().moveSection('snippets', -2)
    setActivePinia(createPinia())
    expect(useSettingsStore().sectionOrder).toEqual(['snippets', 'saved', 'external'])
  })

  it('records the one-time example-seed decision and persists it', () => {
    const s = useSettingsStore()
    expect(s.examplesSeeded).toBe(false) // fresh install: not yet decided
    s.markExamplesSeeded()
    expect(s.examplesSeeded).toBe(true)
    // survives a reload, so the example is never seeded twice
    setActivePinia(createPinia())
    expect(useSettingsStore().examplesSeeded).toBe(true)
  })

  it('repairs a corrupt or partial persisted section order', () => {
    localStorage.setItem(
      'diffbro.settings',
      JSON.stringify({ sectionOrder: ['snippets', 'bogus', 'snippets'] })
    )
    const s = useSettingsStore()
    // dedupe + drop unknown + append any missing, so all three always show.
    expect([...s.sectionOrder].sort()).toEqual([...SECTIONS].sort())
    expect(s.sectionOrder[0]).toBe('snippets')
  })

  it('stores and reconciles shelf order against the shelves that exist now', () => {
    const s = useSettingsStore()
    s.setShelfOrder('snippets', ['b', 'a'])
    // A stored id that vanished is dropped; a brand-new shelf is appended.
    expect(s.shelfOrderFor('snippets', ['a', 'b', 'c'])).toEqual(['b', 'a', 'c'])
    expect(s.shelfOrderFor('external', ['x'])).toEqual(['x'])
  })

  it('migrates the legacy shortcut-bar dismissal flag', () => {
    localStorage.setItem('diffbro.shortcutBarDismissed', '1')
    expect(useSettingsStore().showShortcutBar).toBe(false)
  })

  it('clamps each file-type size guard to its own cap, independently', () => {
    const s = useSettingsStore()
    s.setFileSizeLimitMb('spreadsheet', 999999)
    expect(s.fileSizeLimitMb('spreadsheet')).toBe(FILE_TYPE_LIMITS.spreadsheet.cap)
    s.setFileSizeLimitMb('spreadsheet', 0)
    expect(s.fileSizeLimitMb('spreadsheet')).toBe(1)
    // The text limit is untouched by changes to the spreadsheet one.
    expect(s.fileSizeLimitMb('text')).toBe(FILE_TYPE_LIMITS.text.default)
    s.setFileSizeLimitMb('text', 999999)
    expect(s.fileSizeLimitMb('text')).toBe(FILE_TYPE_LIMITS.text.cap)
    s.setFileSizeLimitMb('bogus', 50) // unknown type ignored
    expect(s.fileSizeLimitsMb.bogus).toBeUndefined()
  })

  it('clamps the snippet size guard to its safe range', () => {
    const s = useSettingsStore()
    s.setMaxSnippetSizeKb('not a number')
    expect(s.maxSnippetSizeKb).toBeGreaterThan(0)
    s.setMaxSnippetSizeKb(10_000_000)
    expect(s.maxSnippetSizeKb).toBe(MAX_SNIPPET_SIZE_KB_CAP)
  })

  it('clamps the diff-image height to its safe range, and survives a reload', () => {
    const s = useSettingsStore()
    expect(s.maxExportHeightPx).toBe(DEFAULT_MAX_EXPORT_HEIGHT_PX)
    s.setMaxExportHeightPx('not a number')
    expect(s.maxExportHeightPx).toBe(DEFAULT_MAX_EXPORT_HEIGHT_PX)
    s.setMaxExportHeightPx(999_999)
    expect(s.maxExportHeightPx).toBe(MAX_EXPORT_HEIGHT_PX_CAP)
    s.setMaxExportHeightPx(1)
    expect(s.maxExportHeightPx).toBe(MIN_EXPORT_HEIGHT_PX)

    s.setMaxExportHeightPx(6500)
    setActivePinia(createPinia())
    expect(useSettingsStore().maxExportHeightPx).toBe(6500)
  })

  it('rejects a hand-edited diff-image height outside the range', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ maxExportHeightPx: 5_000_000 }))
    expect(useSettingsStore().maxExportHeightPx).toBe(MAX_EXPORT_HEIGHT_PX_CAP)
  })

  it('migrates the pre-per-type maxComparisonFileMb into the text limit', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ maxComparisonFileMb: 42 }))
    const s = useSettingsStore()
    expect(s.fileSizeLimitMb('text')).toBe(42) // legacy value -> text bucket
    expect(s.fileSizeLimitMb('spreadsheet')).toBe(FILE_TYPE_LIMITS.spreadsheet.default)
  })

  it('persists per-type limits and a legacy text mirror across reload', () => {
    useSettingsStore().setFileSizeLimitMb('spreadsheet', 60)
    const raw = JSON.parse(localStorage.getItem('diffbro.settings'))
    expect(raw.fileSizeLimitsMb.spreadsheet).toBe(60)
    expect(raw.maxComparisonFileMb).toBe(FILE_TYPE_LIMITS.text.default) // legacy mirror
    setActivePinia(createPinia())
    expect(useSettingsStore().fileSizeLimitMb('spreadsheet')).toBe(60)
  })

  it('daily theme rotation defaults off and persists when toggled', () => {
    const s = useSettingsStore()
    expect(s.rotateThemeDaily).toBe(false)
    s.setRotateThemeDaily(true)
    setActivePinia(createPinia())
    expect(useSettingsStore().rotateThemeDaily).toBe(true)
  })

  it('toggles the shortcut bar and persists it', () => {
    useSettingsStore().setShowShortcutBar(false)
    setActivePinia(createPinia())
    expect(useSettingsStore().showShortcutBar).toBe(false)
  })

  it('drag-reorders a section to land just before its drop target', () => {
    const s = useSettingsStore()
    s.reorderSections('snippets', 'saved') // drop snippets before saved
    expect(s.sectionOrder).toEqual(['snippets', 'saved', 'external'])
    s.reorderSections('external', 'snippets') // external before snippets
    expect(s.sectionOrder).toEqual(['external', 'snippets', 'saved'])
  })

  it('ignores a reorder onto itself or an unknown id', () => {
    const s = useSettingsStore()
    s.reorderSections('saved', 'saved')
    s.reorderSections('bogus', 'saved')
    s.reorderSections('saved', 'bogus')
    expect(s.sectionOrder).toEqual(SECTIONS)
  })

  it('locks section order: move and reorder become no-ops until unlocked', () => {
    const s = useSettingsStore()
    expect(s.sectionsLocked).toBe(false)
    s.toggleSectionsLock()
    expect(s.sectionsLocked).toBe(true)
    s.moveSection('snippets', -1)
    s.reorderSections('snippets', 'saved')
    expect(s.sectionOrder).toEqual(SECTIONS) // frozen
    // survives a reload
    setActivePinia(createPinia())
    const reloaded = useSettingsStore()
    expect(reloaded.sectionsLocked).toBe(true)
    reloaded.toggleSectionsLock()
    reloaded.moveSection('snippets', -1)
    expect(reloaded.sectionOrder).toEqual(['saved', 'snippets', 'external'])
  })

  it('remembers a keyed dialog size across reloads', () => {
    const s = useSettingsStore()
    expect(s.dialogSize('snippet')).toBeNull() // default: use the dialog's own width
    s.setDialogSize('snippet', { width: 720, height: 560 })
    expect(s.dialogSize('snippet')).toEqual({ width: 720, height: 560 })
    setActivePinia(createPinia())
    expect(useSettingsStore().dialogSize('snippet')).toEqual({ width: 720, height: 560 })
  })

  it('persists the maximize-dialogs toggle', () => {
    const s = useSettingsStore()
    expect(s.maximizeDialogs).toBe(false)
    s.setMaximizeDialogs(true)
    expect(s.maximizeDialogs).toBe(true)
    setActivePinia(createPinia())
    expect(useSettingsStore().maximizeDialogs).toBe(true)
  })

  it('keeps each dialog key independent', () => {
    const s = useSettingsStore()
    s.setDialogSize('snippet', { width: 720, height: 560 })
    s.setDialogSize('base64', { width: 640, height: 480 })
    expect(s.dialogSize('snippet')).toEqual({ width: 720, height: 560 })
    expect(s.dialogSize('base64')).toEqual({ width: 640, height: 480 })
    expect(s.dialogSize('unknown')).toBeNull()
  })

  it('clamps a stored size to its bounds and rejects partial ones', () => {
    const s = useSettingsStore()
    s.setDialogSize('snippet', { width: 10, height: 99999 }) // below min / above max
    expect(s.dialogSize('snippet')).toEqual({ width: 320, height: 3000 })
    s.setDialogSize('snippet', { width: 800 }) // missing height — ignored
    expect(s.dialogSize('snippet')).toEqual({ width: 320, height: 3000 })
  })

  it('drops a corrupt persisted dialog size but keeps valid siblings', () => {
    localStorage.setItem(
      'diffbro.settings',
      JSON.stringify({
        dialogSizes: {
          snippet: { width: 'wide', height: 400 },
          base64: { width: 600, height: 500 }
        }
      })
    )
    const s = useSettingsStore()
    expect(s.dialogSize('snippet')).toBeNull()
    expect(s.dialogSize('base64')).toEqual({ width: 600, height: 500 })
  })

  it('accepts and persists a valid quick look-up shortcut', () => {
    const s = useSettingsStore()
    expect(s.quickLookShortcut).toBe('CommandOrControl+Shift+Space')
    expect(s.setQuickLookShortcut('Alt+Shift+D')).toBe(true)
    expect(s.quickLookShortcut).toBe('Alt+Shift+D')
    expect(JSON.parse(localStorage.getItem('diffbro.settings')).quickLookShortcut).toBe(
      'Alt+Shift+D'
    )
  })

  it('rejects an invalid shortcut and keeps the previous binding', () => {
    const s = useSettingsStore()
    expect(s.setQuickLookShortcut('Space')).toBe(false) // no modifier
    expect(s.quickLookShortcut).toBe('CommandOrControl+Shift+Space')
  })

  it('falls back to the default when the persisted shortcut is invalid', () => {
    localStorage.setItem('diffbro.settings', JSON.stringify({ quickLookShortcut: 'garbage' }))
    const s = useSettingsStore()
    expect(s.quickLookShortcut).toBe('CommandOrControl+Shift+Space')
  })

  it('records recent tools most-recent-first, deduped and capped', () => {
    const s = useSettingsStore()
    expect(s.recentTools).toEqual([])
    s.noteToolUsed('json')
    s.noteToolUsed('base64')
    s.noteToolUsed('json') // promotes, never duplicates
    expect(s.recentTools).toEqual(['json', 'base64'])

    for (const id of ['xml', 'lines', 'uuid', 'jwt']) s.noteToolUsed(id)
    expect(s.recentTools).toHaveLength(MAX_RECENT_TOOLS)
    expect(s.recentTools[0]).toBe('jwt')
    expect(JSON.parse(localStorage.getItem('diffbro.settings')).recentTools).toEqual(s.recentTools)
  })

  it('ignores an unknown tool id without persisting a change', () => {
    const s = useSettingsStore()
    s.noteToolUsed('json')
    const before = localStorage.getItem('diffbro.settings')
    s.noteToolUsed('not-a-tool')
    expect(s.recentTools).toEqual(['json'])
    expect(localStorage.getItem('diffbro.settings')).toBe(before)
  })

  it('drops junk from a hand-edited recentTools list', () => {
    localStorage.setItem(
      'diffbro.settings',
      JSON.stringify({ recentTools: ['json', 42, 'gone', 'uuid'] })
    )
    const s = useSettingsStore()
    expect(s.recentTools).toEqual(['json', 'gone', 'uuid'])
    // A stale id survives storage but is dropped at render time (utils/tools).
    expect(recentTools(s.recentTools).map((t) => t.id)).toEqual(['json', 'uuid'])
  })
})
