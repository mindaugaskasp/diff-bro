import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUICKLOOK_SHORTCUT,
  settingsStateFrom
} from '../../../src/renderer/src/utils/settingsDefaults'

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
