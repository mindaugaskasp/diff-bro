import { describe, expect, it, vi } from 'vitest'
import { createRateLimit, coalesce } from '../../../src/main/lan/rateLimit'

describe('rate limit', () => {
  it('allows up to the limit inside the window, per key', () => {
    const limit = createRateLimit({ limit: 2, windowMs: 60_000 })
    expect(limit.allow('a', 0)).toBe(true)
    expect(limit.allow('a', 1)).toBe(true)
    expect(limit.allow('a', 2)).toBe(false)
    expect(limit.allow('b', 2)).toBe(true)
  })

  it('allows again once the window has passed', () => {
    const limit = createRateLimit({ limit: 1, windowMs: 1000 })
    expect(limit.allow('a', 0)).toBe(true)
    expect(limit.allow('a', 999)).toBe(false)
    expect(limit.allow('a', 1000)).toBe(true)
  })

  it('forgets idle keys so the table cannot grow without bound', () => {
    const limit = createRateLimit({ limit: 1, windowMs: 1000 })
    for (let i = 0; i < 100; i++) limit.allow(`k${i}`, 0)
    limit.allow('fresh', 5000)
    expect(limit.size()).toBe(1)
  })
})

describe('coalesce', () => {
  it('runs once for a burst of calls, after the burst', () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const later = coalesce(run, 100)
    for (let i = 0; i < 256; i++) later()
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(run).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
