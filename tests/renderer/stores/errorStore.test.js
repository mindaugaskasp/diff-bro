import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useErrorStore } from '../../../src/renderer/src/stores/errorStore'

beforeEach(() => {
  setActivePinia(createPinia())
  window.api = { logError: vi.fn() }
})

describe('errorStore', () => {
  it('forwards an Error to the local log and raises the dialog', () => {
    const s = useErrorStore()
    s.capture(new Error('kaboom'), 'window.error')
    expect(s.visible).toBe(true)
    expect(s.lastError.message).toBe('kaboom')
    expect(window.api.logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'kaboom', context: 'window.error' })
    )
  })

  it('normalises a PromiseRejectionEvent-like reason', () => {
    const s = useErrorStore()
    s.capture({ reason: new Error('rejected') }, 'unhandledrejection')
    expect(s.lastError.message).toBe('rejected')
  })

  it('handles a plain string error', () => {
    const s = useErrorStore()
    s.capture('bare string', 'window.error')
    expect(s.lastError.message).toBe('bare string')
  })

  it('throttles identical repeats: no second log, no re-raise', () => {
    const s = useErrorStore()
    s.capture(new Error('same'), 'ctx')
    s.dismiss()
    s.capture(new Error('same'), 'ctx') // within the window -> dropped
    expect(window.api.logError).toHaveBeenCalledTimes(1)
    expect(s.visible).toBe(false)
  })

  it('logs a genuinely different error even right after another', () => {
    const s = useErrorStore()
    s.capture(new Error('one'), 'ctx')
    s.capture(new Error('two'), 'ctx')
    expect(window.api.logError).toHaveBeenCalledTimes(2)
    expect(s.lastError.message).toBe('two')
  })

  it('ignores benign framework noise (Monaco Canceled, ResizeObserver, opaque script error)', () => {
    const s = useErrorStore()
    s.capture(new Error('Canceled'), 'unhandledrejection')
    const cancellation = Object.assign(new Error('operation cancelled'), {
      name: 'CancellationError'
    })
    s.capture({ reason: cancellation }, 'unhandledrejection')
    s.capture('ResizeObserver loop completed with undelivered notifications', 'window.error')
    s.capture('Script error.', 'window.error')
    expect(s.visible).toBe(false)
    expect(window.api.logError).not.toHaveBeenCalled()
  })

  // Monaco throws this when its diff worker returns nothing because the models
  // were swapped mid-computation — which is what a re-diff after a file changes
  // on disk does. Its own source says "Text models might be disposed!" two lines
  // above the throw, and it handles the CANCELLED case but not this one. The
  // next re-diff produces the real result, so raising a dialog over it puts a
  // scrim across the app for a race the user never caused.
  it('ignores the diff worker losing a race with a model swap', () => {
    const s = useErrorStore()
    s.capture(new Error('no diff result available'), 'unhandledrejection')
    s.capture({ reason: new Error('no diff result available') }, 'unhandledrejection')
    expect(s.visible).toBe(false)
    expect(window.api.logError).not.toHaveBeenCalled()
  })

  // The caller needs to know, so it can stop a noise rejection being reported as
  // unhandled on top of being ignored.
  it('says whether it recorded, so noise can be silenced at the source', () => {
    const s = useErrorStore()
    expect(s.capture(new Error('no diff result available'), 'unhandledrejection')).toBe(false)
    expect(s.capture(new Error('Canceled'), 'unhandledrejection')).toBe(false)
    expect(s.capture(new Error('something real'), 'window.error')).toBe(true)
  })

  it('never throws when the log bridge is unavailable', () => {
    window.api = {}
    const s = useErrorStore()
    expect(() => s.capture(new Error('x'))).not.toThrow()
    expect(s.visible).toBe(true)
  })
})
