import { describe, expect, it, vi } from 'vitest'
import {
  bindMergeKeys,
  stepFromKey
} from '../../../../src/renderer/src/features/merge/useMergeKeys'

describe('stepFromKey', () => {
  it('walks the conflicts the way every JetBrains user already types it', () => {
    expect(stepFromKey({ key: 'F7' })).toBe(1)
    expect(stepFromKey({ key: 'F7', shiftKey: true })).toBe(-1)
  })

  it('keeps out of the way of anything with a modifier on it', () => {
    expect(stepFromKey({ key: 'F7', metaKey: true })).toBe(0)
    expect(stepFromKey({ key: 'F7', ctrlKey: true })).toBe(0)
    expect(stepFromKey({ key: 'F7', altKey: true })).toBe(0)
    expect(stepFromKey({ key: 'a' })).toBe(0)
  })
})

describe('bindMergeKeys', () => {
  const press = (init) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { ...init, cancelable: true }))

  it('walks the conflicts while it is bound, and stops the moment it is not', () => {
    const step = vi.fn()
    const unbind = bindMergeKeys(step)
    press({ key: 'F7' })
    press({ key: 'F7', shiftKey: true })
    expect(step.mock.calls).toEqual([[1], [-1]])
    unbind()
    press({ key: 'F7' })
    expect(step).toHaveBeenCalledTimes(2)
  })

  // A key it does not own must reach whatever does.
  it('leaves any other key alone', () => {
    const step = vi.fn()
    const unbind = bindMergeKeys(step)
    const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
    window.dispatchEvent(event)
    expect(step).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    unbind()
  })
})
