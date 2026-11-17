import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStateSaver } from '../../src/main/windowStateSaver'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setUp() {
  const win = { gone: false }
  const snapshot = vi.fn(() => {
    if (win.gone) throw new Error('Object has been destroyed')
    return { width: 800 }
  })
  const write = vi.fn()
  const saver = createStateSaver({ snapshot, write, isGone: () => win.gone })
  return { win, snapshot, write, saver }
}

describe('saving window bounds', () => {
  it('saves once, after the last of a burst of moves', () => {
    const { saver, write } = setUp()
    saver.soon()
    saver.soon()
    vi.advanceTimersByTime(500)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('never reaches a window closed while a save was pending', () => {
    const { win, saver, write } = setUp()
    saver.soon()
    saver.now()
    win.gone = true
    expect(() => vi.advanceTimersByTime(500)).not.toThrow()
    expect(write).toHaveBeenCalledTimes(1)
  })
})
