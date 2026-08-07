import { describe, expect, it, vi } from 'vitest'
import { useCaretBackOut } from '../../../src/renderer/src/composables/useCaretBackOut'

// The launcher's tool panels are reached with → and left with ←. The guard has
// to tell "the caret can't move left any further" from "the field still wants
// this key", or ← either traps you in the panel or eats your cursor movement.
const press = (key, target = {}, mods = {}) => ({
  key,
  target,
  preventDefault: vi.fn(),
  ...mods
})
const field = (start, end = start) => ({
  tagName: 'INPUT',
  selectionStart: start,
  selectionEnd: end
})

describe('useCaretBackOut', () => {
  it('backs out on ← when the event came from outside a text field', () => {
    const back = vi.fn()
    const e = press('ArrowLeft', { tagName: 'DIV' })
    useCaretBackOut(back).onKeydown(e)
    expect(back).toHaveBeenCalledOnce()
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('backs out when the caret sits at the start of a field', () => {
    const back = vi.fn()
    useCaretBackOut(back).onKeydown(press('ArrowLeft', field(0)))
    expect(back).toHaveBeenCalledOnce()
  })

  it('leaves ← to the field when the caret can still move', () => {
    const back = vi.fn()
    const e = press('ArrowLeft', field(3))
    useCaretBackOut(back).onKeydown(e)
    expect(back).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('leaves ← to the field when there is a selection, even from offset 0', () => {
    const back = vi.fn()
    useCaretBackOut(back).onKeydown(press('ArrowLeft', field(0, 4)))
    expect(back).not.toHaveBeenCalled()
  })

  it('ignores every other key', () => {
    const back = vi.fn()
    for (const key of ['ArrowRight', 'ArrowUp', 'Escape', 'a']) {
      useCaretBackOut(back).onKeydown(press(key, { tagName: 'DIV' }))
    }
    expect(back).not.toHaveBeenCalled()
  })

  it('ignores ← with a modifier, which means word/line movement', () => {
    const back = vi.fn()
    const guard = useCaretBackOut(back)
    guard.onKeydown(press('ArrowLeft', field(0), { metaKey: true }))
    guard.onKeydown(press('ArrowLeft', field(0), { altKey: true }))
    guard.onKeydown(press('ArrowLeft', field(0), { ctrlKey: true }))
    expect(back).not.toHaveBeenCalled()
  })

  // A checkbox reports selectionStart === null; ← does nothing there, so it
  // should back out rather than trap the user.
  it('backs out from a non-text input', () => {
    const back = vi.fn()
    useCaretBackOut(back).onKeydown(
      press('ArrowLeft', { tagName: 'INPUT', selectionStart: null, selectionEnd: null })
    )
    expect(back).toHaveBeenCalledOnce()
  })
})

// The compose panel gained a <select> and two buttons. On Windows and Linux
// ArrowLeft is the NATIVE way to change a closed select, so backing out there
// threw away the whole draft the moment a keyboard user picked a language.
describe('useCaretBackOut — non-text controls', () => {
  const press = (tagName) => {
    const onBack = vi.fn()
    const preventDefault = vi.fn()
    useCaretBackOut(onBack).onKeydown({ key: 'ArrowLeft', preventDefault, target: { tagName } })
    return { onBack, preventDefault }
  }

  it('leaves ArrowLeft to a <select>, which uses it to change value', () => {
    const { onBack, preventDefault } = press('SELECT')
    expect(onBack).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('leaves ArrowLeft to a button rather than discarding the panel', () => {
    expect(press('BUTTON').onBack).not.toHaveBeenCalled()
  })
})
