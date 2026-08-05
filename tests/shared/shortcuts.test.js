import { describe, expect, it } from 'vitest'
import {
  LEGACY_QUICKLOOK_SHORTCUT,
  defaultQuickLookShortcut,
  migratedQuickLookShortcut
} from '../../src/shared/shortcuts'

describe('defaultQuickLookShortcut', () => {
  it('gives Windows a binding that does not fight parameter-info', () => {
    expect(defaultQuickLookShortcut('win32')).toBe('Control+Alt+Space')
  })

  it('leaves every other platform on the original', () => {
    expect(defaultQuickLookShortcut('darwin')).toBe(LEGACY_QUICKLOOK_SHORTCUT)
    expect(defaultQuickLookShortcut('linux')).toBe(LEGACY_QUICKLOOK_SHORTCUT)
    expect(defaultQuickLookShortcut(undefined)).toBe(LEGACY_QUICKLOOK_SHORTCUT)
  })
})

describe('migratedQuickLookShortcut', () => {
  const fallback = 'Control+Alt+Space'

  it('moves an un-migrated install off the old default', () => {
    expect(
      migratedQuickLookShortcut({ stored: LEGACY_QUICKLOOK_SHORTCUT, migrated: false, fallback })
    ).toBe(fallback)
  })

  it('does it once — a migrated install keeps whatever it holds', () => {
    expect(
      migratedQuickLookShortcut({ stored: LEGACY_QUICKLOOK_SHORTCUT, migrated: true, fallback })
    ).toBe(LEGACY_QUICKLOOK_SHORTCUT)
  })

  it('never touches a binding the user chose for themselves', () => {
    expect(migratedQuickLookShortcut({ stored: 'Alt+Shift+D', migrated: false, fallback })).toBe(
      'Alt+Shift+D'
    )
  })

  it('falls back when nothing is stored', () => {
    for (const stored of [null, undefined, '', '   ', 42]) {
      expect(migratedQuickLookShortcut({ stored, migrated: true, fallback })).toBe(fallback)
    }
  })

  // On macOS the fallback IS the legacy value, so the migration is a no-op there
  // rather than a special case anyone has to remember.
  it('is inert where the default did not move', () => {
    expect(
      migratedQuickLookShortcut({
        stored: LEGACY_QUICKLOOK_SHORTCUT,
        migrated: false,
        fallback: LEGACY_QUICKLOOK_SHORTCUT
      })
    ).toBe(LEGACY_QUICKLOOK_SHORTCUT)
  })
})
