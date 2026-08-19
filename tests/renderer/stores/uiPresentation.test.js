import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'

// Escape restores whatever the window was doing before presentation took it.
let fullScreen

beforeEach(() => {
  setActivePinia(createPinia())
  fullScreen = false
  window.api = {
    isFullScreen: vi.fn(async () => fullScreen),
    setFullScreen: vi.fn(async (flag) => {
      fullScreen = flag
      return fullScreen
    })
  }
})

describe('presentation mode and the window', () => {
  it('goes full screen on the way in', async () => {
    const ui = useUiStore()
    await ui.enterPresenting()
    expect(ui.presenting).toBe(true)
    expect(window.api.setFullScreen).toHaveBeenCalledWith(true)
    expect(fullScreen).toBe(true)
  })

  it('comes back out of full screen on the way out', async () => {
    const ui = useUiStore()
    await ui.enterPresenting()
    await ui.exitPresenting()
    expect(ui.presenting).toBe(false)
    expect(fullScreen).toBe(false)
  })

  // Leaving must not yank the window out of a state the reader chose.
  it('leaves a window that was already full screen alone', async () => {
    fullScreen = true
    const ui = useUiStore()
    await ui.enterPresenting()
    expect(fullScreen).toBe(true)
    await ui.exitPresenting()
    expect(fullScreen).toBe(true)
    expect(window.api.setFullScreen).not.toHaveBeenCalledWith(false)
  })

  it('toggles both ways through one action', async () => {
    const ui = useUiStore()
    await ui.togglePresenting()
    expect(ui.presenting).toBe(true)
    expect(fullScreen).toBe(true)
    await ui.togglePresenting()
    expect(ui.presenting).toBe(false)
    expect(fullScreen).toBe(false)
  })

  it('exits cleanly when it was never presenting', async () => {
    const ui = useUiStore()
    await ui.exitPresenting()
    expect(ui.presenting).toBe(false)
    expect(window.api.setFullScreen).not.toHaveBeenCalled()
  })

  // The launcher window has no such API; presentation must not throw there.
  it('survives a window that cannot report its state', async () => {
    window.api = {}
    const ui = useUiStore()
    await expect(ui.enterPresenting()).resolves.not.toThrow()
    expect(ui.presenting).toBe(true)
  })
})
