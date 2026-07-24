import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useSettingsStore,
  SECTIONS,
  FILE_TYPE_LIMITS,
  MAX_SNIPPET_SIZE_KB_CAP
} from '../../../src/renderer/src/stores/settingsStore'

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
})
