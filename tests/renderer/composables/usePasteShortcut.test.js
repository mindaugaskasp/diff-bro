import { describe, expect, it } from 'vitest'
import {
  isEditableTarget,
  isPasteChord
} from '../../../src/renderer/src/composables/usePasteShortcut'

describe('isPasteChord', () => {
  const chord = (over) => ({
    key: 'v',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...over
  })

  it('accepts Ctrl+V and Cmd+V', () => {
    expect(isPasteChord(chord({ ctrlKey: true }))).toBe(true)
    expect(isPasteChord(chord({ metaKey: true }))).toBe(true)
    expect(isPasteChord(chord({ ctrlKey: true, key: 'V' }))).toBe(true)
  })

  it('rejects V without a modifier, and modifier combos with alt/shift', () => {
    expect(isPasteChord(chord({}))).toBe(false)
    expect(isPasteChord(chord({ ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isPasteChord(chord({ ctrlKey: true, altKey: true }))).toBe(false)
    expect(isPasteChord(chord({ ctrlKey: true, key: 'c' }))).toBe(false)
  })
})

describe('isEditableTarget', () => {
  it('is true for inputs, textareas, and contenteditable', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
  it('is false for non-editable elements and null', () => {
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false)
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
