import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUICKLOOK_SHORTCUT,
  SECTIONS,
  sanitizeSectionOrder,
  settingsStateFrom
} from '../../../src/renderer/src/utils/settingsDefaults'
import {
  DEFAULT_TAG_SHELF_PX,
  MAX_TAG_SHELF_PX,
  MIN_TAG_SHELF_PX,
  TAG_ROW_PX
} from '../../../src/renderer/src/utils/tagShelf'
import { LEGACY_QUICKLOOK_SHORTCUT } from '../../../src/shared/shortcuts'

// Growing SECTIONS is the one change here that reaches settings files already on
// disk. A stored order predates every section added after it was written, so
// sanitize has to ADD the newcomer while keeping the order the user dragged —
// resetting to the default would silently undo their arrangement on upgrade.
describe('sanitizeSectionOrder', () => {
  it('keeps a user order and appends a section added since it was stored', () => {
    // Exactly what a settings.json written before Tools existed holds.
    const stored = ['snippets', 'saved', 'external']
    expect(sanitizeSectionOrder(stored)).toEqual(['snippets', 'saved', 'external', 'tools'])
  })

  it('appends every missing section, not just the last one', () => {
    expect(sanitizeSectionOrder(['snippets'])).toEqual([
      'snippets',
      ...SECTIONS.filter((id) => id !== 'snippets')
    ])
  })

  it('drops an unknown id rather than rendering a section that does not exist', () => {
    expect(sanitizeSectionOrder(['snippets', 'bogus', 'saved'])).toEqual([
      'snippets',
      'saved',
      ...SECTIONS.filter((id) => id !== 'snippets' && id !== 'saved')
    ])
  })

  it('drops a repeat instead of drawing the section twice', () => {
    const out = sanitizeSectionOrder(['snippets', 'snippets', 'saved'])
    expect(out).toHaveLength(SECTIONS.length)
    expect(new Set(out).size).toBe(SECTIONS.length)
    expect(out[0]).toBe('snippets')
  })

  it('falls back to the default order for anything that is not an array', () => {
    for (const bad of [null, undefined, 'saved', 42, {}]) {
      expect(sanitizeSectionOrder(bad)).toEqual(SECTIONS)
    }
  })

  it('always returns exactly the known sections, once each', () => {
    for (const input of [[], ['tools'], ['bogus'], [...SECTIONS].reverse()]) {
      expect([...sanitizeSectionOrder(input)].sort()).toEqual([...SECTIONS].sort())
    }
  })
})

// The migration's own logic lives in tests/shared/shortcuts.test.js; this is the
// wiring — that settingsStateFrom applies it and then records that it has, so a
// settings file cannot be moved off its binding twice.
describe('settingsStateFrom, quick look-up shortcut', () => {
  it('records the migration as done, whatever it read', () => {
    expect(settingsStateFrom({}, {}).quickLookShortcutMigrated).toBe(true)
    expect(
      settingsStateFrom({ quickLookShortcut: 'Alt+Shift+D' }, {}).quickLookShortcutMigrated
    ).toBe(true)
  })

  it('keeps a binding the user chose', () => {
    expect(settingsStateFrom({ quickLookShortcut: 'Alt+Shift+D' }, {}).quickLookShortcut).toBe(
      'Alt+Shift+D'
    )
  })

  it('falls back for a hand-edited value that is not an accelerator', () => {
    expect(settingsStateFrom({ quickLookShortcut: 'garbage' }, {}).quickLookShortcut).toBe(
      DEFAULT_QUICKLOOK_SHORTCUT
    )
  })

  it('an already-migrated file keeps the legacy binding rather than moving again', () => {
    const state = settingsStateFrom(
      { quickLookShortcut: LEGACY_QUICKLOOK_SHORTCUT, quickLookShortcutMigrated: true },
      {}
    )
    expect(state.quickLookShortcut).toBe(LEGACY_QUICKLOOK_SHORTCUT)
  })
})

// The shelf's depth used to be a count of chip rows, four chips to a row. Every
// settings file already on disk holds that number, and a reader who dragged the
// shelf deep must not find it back at two rows after an update.
describe('settingsStateFrom, the tag shelf depth', () => {
  it('carries a dragged row count over as the height those rows took', () => {
    expect(settingsStateFrom({ tagShelfRows: 6 }, {}).tagShelfHeight).toBe(6 * TAG_ROW_PX)
  })

  // Two was the old floor as well as the old default, so it says nothing about
  // what the reader wanted — it rests at the new default rather than shrinking.
  it('reads a stored two as never having been dragged at all', () => {
    expect(settingsStateFrom({ tagShelfRows: 2 }, {}).tagShelfHeight).toBe(DEFAULT_TAG_SHELF_PX)
  })

  it('prefers the height once one has been written', () => {
    expect(settingsStateFrom({ tagShelfRows: 6, tagShelfHeight: 300 }, {}).tagShelfHeight).toBe(300)
  })

  it('rests at the default depth for a file that has neither', () => {
    expect(settingsStateFrom({}, {}).tagShelfHeight).toBe(DEFAULT_TAG_SHELF_PX)
  })

  it('clamps a hand-edited height back into range', () => {
    expect(settingsStateFrom({ tagShelfHeight: 99999 }, {}).tagShelfHeight).toBe(MAX_TAG_SHELF_PX)
    expect(settingsStateFrom({ tagShelfHeight: -20 }, {}).tagShelfHeight).toBe(MIN_TAG_SHELF_PX)
    expect(settingsStateFrom({ tagShelfHeight: 'deep' }, {}).tagShelfHeight).toBe(
      DEFAULT_TAG_SHELF_PX
    )
    expect(settingsStateFrom({ tagShelfRows: 'lots' }, {}).tagShelfHeight).toBe(
      DEFAULT_TAG_SHELF_PX
    )
  })
})
