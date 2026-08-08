import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useNameComplete } from '../../../src/renderer/src/composables/useNameComplete'

const NAMES = ['Deploy — prod', 'Deploy — staging']

const setup = (typed = 'Dep') => {
  const name = ref(typed)
  const names = ref(NAMES)
  const hook = useNameComplete({ name, names })
  // The caret sits at the end unless a test says otherwise.
  hook.inputEl.value = { selectionStart: typed.length, selectionEnd: typed.length, scrollLeft: 0 }
  return { name, names, hook }
}

const press = (hook, key, over = {}) => {
  const preventDefault = vi.fn()
  hook.onKeydown({ key, preventDefault, ...over })
  return preventDefault
}

describe('useNameComplete', () => {
  it('offers the shared head as ghost text', () => {
    expect(setup('Dep').hook.ghost.value).toBe('loy — ')
  })

  it('Tab accepts it into the value and swallows the key', () => {
    const { name, hook } = setup('Dep')
    const prevented = press(hook, 'Tab')
    expect(name.value).toBe('Deploy — ')
    expect(prevented).toHaveBeenCalled()
    expect(hook.ghost.value).toBe('')
  })

  it('→ accepts only when the caret is at the very end', () => {
    const { name, hook } = setup('Dep')
    hook.inputEl.value = { selectionStart: 1, selectionEnd: 1 }
    const prevented = press(hook, 'ArrowRight')
    expect(name.value).toBe('Dep')
    expect(prevented).not.toHaveBeenCalled()
  })

  it('→ at the end does accept', () => {
    const { name, hook } = setup('Dep')
    press(hook, 'ArrowRight')
    expect(name.value).toBe('Deploy — ')
  })

  // A selection is not a caret: → collapses it, it does not complete.
  it('leaves → alone while text is selected', () => {
    const { name, hook } = setup('Dep')
    hook.inputEl.value = { selectionStart: 0, selectionEnd: 3 }
    press(hook, 'ArrowRight')
    expect(name.value).toBe('Dep')
  })

  it('does nothing when there is no ghost to accept', () => {
    const { name, hook } = setup('zzz')
    const prevented = press(hook, 'Tab')
    expect(name.value).toBe('zzz')
    // Tab must still move focus when it is not accepting anything.
    expect(prevented).not.toHaveBeenCalled()
  })

  it('leaves every other key untouched', () => {
    const { name, hook } = setup('Dep')
    for (const key of ['a', 'Escape', 'Enter', 'ArrowLeft', 'Backspace']) {
      expect(press(hook, key)).not.toHaveBeenCalled()
    }
    expect(name.value).toBe('Dep')
  })

  it('mirrors the input scroll onto the overlay, so the ghost stays put', () => {
    const { hook } = setup('Dep')
    hook.inputEl.value = { selectionStart: 3, selectionEnd: 3, scrollLeft: 42 }
    hook.overlayEl.value = { scrollLeft: 0 }
    hook.onScroll()
    expect(hook.overlayEl.value.scrollLeft).toBe(42)
  })

  it('survives a scroll or a key before the input is mounted', () => {
    const { hook } = setup('Dep')
    hook.inputEl.value = null
    expect(() => hook.onScroll()).not.toThrow()
    expect(() => press(hook, 'Tab')).not.toThrow()
  })
})
