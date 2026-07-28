import { describe, expect, it } from 'vitest'
import {
  acceleratorFromEvent,
  isValidAccelerator,
  acceleratorLabel
} from '../../../src/renderer/src/utils/accelerator'

// A minimal keydown: the util reads e.code and the modifier flags.
const ev = (code, mods = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

describe('acceleratorFromEvent', () => {
  it('builds a cross-platform accelerator from modifiers + a letter', () => {
    expect(acceleratorFromEvent(ev('KeyP', { ctrlKey: true, shiftKey: true }))).toBe(
      'CommandOrControl+Shift+P'
    )
  })

  it('treats Cmd (metaKey) as CommandOrControl too', () => {
    expect(acceleratorFromEvent(ev('Space', { metaKey: true, shiftKey: true }))).toBe(
      'CommandOrControl+Shift+Space'
    )
  })

  it('maps digits, function keys, and named keys by physical code', () => {
    expect(acceleratorFromEvent(ev('Digit1', { altKey: true }))).toBe('Alt+1')
    expect(acceleratorFromEvent(ev('F5', { ctrlKey: true }))).toBe('CommandOrControl+F5')
    expect(acceleratorFromEvent(ev('ArrowUp', { altKey: true }))).toBe('Alt+Up')
  })

  it('returns null for a modifier-only or unsupported key', () => {
    expect(acceleratorFromEvent(ev('ShiftLeft', { shiftKey: true }))).toBe(null)
    expect(acceleratorFromEvent(ev('MediaPlayPause'))).toBe(null)
  })
})

describe('isValidAccelerator', () => {
  it('requires at least one modifier and exactly one key', () => {
    expect(isValidAccelerator('CommandOrControl+Shift+Space')).toBe(true)
    expect(isValidAccelerator('Alt+1')).toBe(true)
  })

  it('rejects a bare key, modifier-only, or multi-key combos', () => {
    expect(isValidAccelerator('Space')).toBe(false)
    expect(isValidAccelerator('CommandOrControl+Shift')).toBe(false)
    expect(isValidAccelerator('CommandOrControl+A+B')).toBe(false)
    expect(isValidAccelerator('')).toBe(false)
    expect(isValidAccelerator(null)).toBe(false)
  })
})

describe('acceleratorLabel', () => {
  it('renders macOS glyphs joined by spaces', () => {
    expect(acceleratorLabel('CommandOrControl+Shift+Space', true)).toBe('⌘ ⇧ Space')
  })
  it('renders word modifiers joined by + elsewhere', () => {
    expect(acceleratorLabel('CommandOrControl+Shift+Space', false)).toBe('Ctrl+Shift+Space')
  })
  it('tolerates an empty value', () => {
    expect(acceleratorLabel('', true)).toBe('')
  })
})
