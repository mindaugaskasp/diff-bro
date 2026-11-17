import { describe, expect, it } from 'vitest'
import { tabCycleAction } from '../../../src/renderer/src/composables/useTabCycleKeys'

const key = (init) => new KeyboardEvent('keydown', { key: 'Tab', ...init })

describe('Ctrl+Tab between tabs', () => {
  it('moves forward with Ctrl+Tab and back with Ctrl+Shift+Tab', () => {
    expect(tabCycleAction(key({ ctrlKey: true }))).toBe('tab-next')
    expect(tabCycleAction(key({ ctrlKey: true, shiftKey: true }))).toBe('tab-prev')
  })

  it('leaves plain Tab, and Tab with other modifiers, to the page', () => {
    expect(tabCycleAction(key({}))).toBeNull()
    expect(tabCycleAction(key({ shiftKey: true }))).toBeNull()
    expect(tabCycleAction(key({ metaKey: true }))).toBeNull()
    expect(tabCycleAction(key({ ctrlKey: true, altKey: true }))).toBeNull()
    expect(tabCycleAction(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))).toBeNull()
  })
})
