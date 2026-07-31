import { describe, expect, it, vi } from 'vitest'
import { usePanelScroll } from '../../../src/renderer/src/composables/usePanelScroll'

// A tall panel in the short launcher window has to be reachable by keyboard, but
// a textarea must keep the arrows while its caret can still move — otherwise
// typing in the Lines tool scrolls the panel out from under you.
const panel = (over = {}) => ({
  value: { scrollTop: 0, clientHeight: 200, scrollHeight: 1000, ...over }
})
const press = (key, target = { tagName: 'DIV' }, mods = {}) => ({
  key,
  target,
  preventDefault: vi.fn(),
  ...mods
})
const textarea = (caret, value = 'abcdef') => ({
  tagName: 'TEXTAREA',
  selectionStart: caret,
  value
})

describe('usePanelScroll', () => {
  it('scrolls down and up from a non-field target', () => {
    const p = panel()
    const { onKeydown } = usePanelScroll(p)
    onKeydown(press('ArrowDown'))
    expect(p.value.scrollTop).toBe(48)
    onKeydown(press('ArrowUp'))
    expect(p.value.scrollTop).toBe(0)
  })

  it('pages by most of a screenful', () => {
    const p = panel()
    usePanelScroll(p).onKeydown(press('PageDown'))
    expect(p.value.scrollTop).toBe(180)
  })

  it('leaves the keys alone while a textarea caret can still move', () => {
    const p = panel()
    const { onKeydown } = usePanelScroll(p)
    onKeydown(press('ArrowDown', textarea(0)))
    onKeydown(press('ArrowUp', textarea(3)))
    expect(p.value.scrollTop).toBe(0)
  })

  it('takes over once the caret reaches the end of the textarea', () => {
    const p = panel()
    usePanelScroll(p).onKeydown(press('ArrowDown', textarea(6)))
    expect(p.value.scrollTop).toBe(48)
  })

  it('scrolls from a single-line input, which cannot use up/down anyway', () => {
    const p = panel()
    usePanelScroll(p).onKeydown(press('ArrowDown', { tagName: 'INPUT', selectionStart: 0 }))
    expect(p.value.scrollTop).toBe(48)
  })

  it('claims the key only when it actually scrolled', () => {
    const p = panel({ scrollTop: 0 })
    // jsdom has no layout, so emulate a container already at its top.
    Object.defineProperty(p.value, 'scrollTop', { get: () => 0, set: () => {}, configurable: true })
    const e = press('ArrowUp')
    usePanelScroll(p).onKeydown(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores modified presses and unrelated keys', () => {
    const p = panel()
    const { onKeydown } = usePanelScroll(p)
    onKeydown(press('ArrowDown', { tagName: 'DIV' }, { metaKey: true }))
    onKeydown(press('ArrowLeft'))
    onKeydown(press('a'))
    expect(p.value.scrollTop).toBe(0)
  })

  it('does nothing before the panel is mounted', () => {
    expect(() => usePanelScroll({ value: null }).onKeydown(press('ArrowDown'))).not.toThrow()
  })
})
