import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useSettingsStore,
  SECTIONS,
  DEFAULT_MAX_COMPARISON_FILE_MB,
  MAX_COMPARISON_FILE_MB_CAP,
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
    expect(s.maxComparisonFileMb).toBe(DEFAULT_MAX_COMPARISON_FILE_MB)
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

  it('clamps the size guards to their safe ranges', () => {
    const s = useSettingsStore()
    s.setMaxComparisonFileMb(999999)
    expect(s.maxComparisonFileMb).toBe(MAX_COMPARISON_FILE_MB_CAP)
    s.setMaxComparisonFileMb(0)
    expect(s.maxComparisonFileMb).toBe(1)
    s.setMaxSnippetSizeKb('not a number')
    expect(s.maxSnippetSizeKb).toBeGreaterThan(0)
    s.setMaxSnippetSizeKb(10_000_000)
    expect(s.maxSnippetSizeKb).toBe(MAX_SNIPPET_SIZE_KB_CAP)
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
