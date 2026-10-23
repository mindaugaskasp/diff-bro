import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHoverReveal } from '../../../src/renderer/src/composables/useHoverReveal'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useHoverReveal', () => {
  it('opens on enter and closes a moment after leave', () => {
    const r = useHoverReveal({ closeMs: 120 })
    r.enter()
    expect(r.open.value).toBe(true)
    r.leave()
    expect(r.open.value).toBe(true)
    vi.advanceTimersByTime(120)
    expect(r.open.value).toBe(false)
  })

  it('stays open when the pointer travels into the popover', () => {
    const r = useHoverReveal({ closeMs: 120 })
    r.enter()
    r.leave()
    r.enter()
    vi.advanceTimersByTime(500)
    expect(r.open.value).toBe(true)
  })

  it('Escape closes it at once', () => {
    const r = useHoverReveal()
    r.enter()
    r.onKeydown({ key: 'Escape', stopPropagation: () => {} })
    expect(r.open.value).toBe(false)
  })

  // Hover moves no focus, so the key arrives at the window, not at the popover.
  it('Escape anywhere closes it while it is open, and is not listened for after', () => {
    const r = useHoverReveal()
    r.enter()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(r.open.value).toBe(false)
    const spy = vi.spyOn(window, 'removeEventListener')
    r.enter()
    r.leave()
    vi.advanceTimersByTime(500)
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function), true)
  })

  it('ignores other keys', () => {
    const r = useHoverReveal()
    r.enter()
    r.onKeydown({ key: 'a' })
    expect(r.open.value).toBe(true)
  })
})
