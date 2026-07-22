import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useCopyFeedback } from '../../../src/renderer/src/composables/useCopyFeedback'

describe('useCopyFeedback', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('flips copied true on flash and clears itself after the duration', () => {
    const { copied, flash } = useCopyFeedback(1000)
    expect(copied.value).toBe(false)
    flash()
    expect(copied.value).toBe(true)
    vi.advanceTimersByTime(999)
    expect(copied.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(copied.value).toBe(false)
  })

  it('restarts the timer on a repeat flash rather than clearing early', () => {
    const { copied, flash } = useCopyFeedback(1000)
    flash()
    vi.advanceTimersByTime(800)
    flash() // second click before the first window elapsed
    vi.advanceTimersByTime(800) // 1600ms since first, 800ms since second
    expect(copied.value).toBe(true)
    vi.advanceTimersByTime(200)
    expect(copied.value).toBe(false)
  })

  it('cancel clears the state and pending timer immediately', () => {
    const { copied, flash, cancel } = useCopyFeedback(1000)
    flash()
    cancel()
    expect(copied.value).toBe(false)
    vi.advanceTimersByTime(1000) // the cancelled timer must not fire
    expect(copied.value).toBe(false)
  })

  it('disposing the scope clears a pending timer so it never writes after unmount', () => {
    const scope = effectScope()
    let api
    scope.run(() => {
      api = useCopyFeedback(1000)
      api.flash()
    })
    scope.stop()
    vi.advanceTimersByTime(1000)
    expect(api.copied.value).toBe(true) // left as-is; timer was cleared, not fired
  })
})
