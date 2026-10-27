import { describe, expect, it } from 'vitest'
import { defaultQuickLookShortcut } from '../../src/shared/shortcuts'

describe('defaultQuickLookShortcut', () => {
  it('gives Windows a binding that does not fight parameter-info', () => {
    expect(defaultQuickLookShortcut('win32')).toBe('Control+Alt+Space')
  })

  it('leaves every other platform on Cmd/Ctrl+Shift+Space', () => {
    expect(defaultQuickLookShortcut('darwin')).toBe('CommandOrControl+Shift+Space')
    expect(defaultQuickLookShortcut('linux')).toBe('CommandOrControl+Shift+Space')
    expect(defaultQuickLookShortcut(undefined)).toBe('CommandOrControl+Shift+Space')
  })
})
