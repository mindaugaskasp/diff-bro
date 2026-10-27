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
  MIN_TAG_SHELF_PX
} from '../../../src/renderer/src/utils/tagShelf'

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

describe('settingsStateFrom, quick look-up shortcut', () => {
  it('keeps a binding the user chose', () => {
    expect(settingsStateFrom({ quickLookShortcut: 'Alt+Shift+D' }, {}).quickLookShortcut).toBe(
      'Alt+Shift+D'
    )
  })

  it('keeps any stored valid binding as it is, with no migration flag', () => {
    const state = settingsStateFrom({ quickLookShortcut: 'CommandOrControl+Shift+Space' }, {})
    expect(state.quickLookShortcut).toBe('CommandOrControl+Shift+Space')
    expect(state).not.toHaveProperty('quickLookShortcutMigrated')
  })

  it('falls back for a hand-edited value that is not an accelerator', () => {
    expect(settingsStateFrom({ quickLookShortcut: 'garbage' }, {}).quickLookShortcut).toBe(
      DEFAULT_QUICKLOOK_SHORTCUT
    )
  })
})

describe('settingsStateFrom, the tag shelf depth', () => {
  it('ignores the old row count', () => {
    expect(settingsStateFrom({ tagShelfRows: 6 }, {}).tagShelfHeight).toBe(DEFAULT_TAG_SHELF_PX)
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
  })
})
