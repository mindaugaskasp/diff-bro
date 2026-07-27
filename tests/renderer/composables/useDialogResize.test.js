import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useDialogResize } from '../../../src/renderer/src/composables/useDialogResize'

// A fake panel element with a measured box; the composable reads offsetWidth/Height.
const fakePanel = (width, height) => ({ value: { offsetWidth: width, offsetHeight: height } })
// A pointer event the composable can read (and whose preventDefault it calls).
const ptr = (clientX, clientY) => ({ clientX, clientY, preventDefault() {}, stopPropagation() {} })

beforeEach(() => {
  window.innerWidth = 2000
  window.innerHeight = 2000
})

describe('useDialogResize', () => {
  it('falls back to the default width and auto height before any resize', () => {
    const { style } = useDialogResize({
      panel: fakePanel(560, 400),
      width: '560px',
      initial: null,
      min: { width: 320, height: 240 },
      onResize: vi.fn()
    })
    expect(style.value).toEqual({ width: '560px', height: null })
  })

  it('starts from a remembered size when given one', () => {
    const { style } = useDialogResize({
      panel: fakePanel(560, 400),
      width: '560px',
      initial: { width: 720, height: 560 },
      min: { width: 320, height: 240 },
      onResize: vi.fn()
    })
    expect(style.value).toEqual({ width: '720px', height: '560px' })
  })

  it('tracks a drag from the east edge and reports the final size on release', () => {
    const onResize = vi.fn()
    const panel = fakePanel(600, 400)
    const { style, beginResize } = useDialogResize({
      panel,
      width: '600px',
      initial: null,
      min: { width: 320, height: 240 },
      onResize
    })
    beginResize('e', ptr(100, 100))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 100 }))
    expect(style.value).toEqual({ width: '700px', height: '400px' })
    window.dispatchEvent(new MouseEvent('pointerup'))
    expect(onResize).toHaveBeenCalledWith({ width: 700, height: 400 })
  })

  // Regression: a drag must not throw when the caller omits `min` (a default
  // floor applies instead of reading .width off undefined).
  it('resizes without a provided min, clamping to the default floor', () => {
    const { size, beginResize } = useDialogResize({
      panel: fakePanel(600, 400),
      width: '600px',
      initial: null,
      onResize: vi.fn()
    })
    expect(() => {
      beginResize('e', ptr(0, 0))
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: -1000, clientY: 0 }))
      window.dispatchEvent(new MouseEvent('pointerup'))
    }).not.toThrow()
    expect(size.width).toBe(320) // default min floor
  })

  it('stops tracking after release', () => {
    const onResize = vi.fn()
    const { size, beginResize } = useDialogResize({
      panel: fakePanel(600, 400),
      width: '600px',
      initial: null,
      min: { width: 320, height: 240 },
      onResize
    })
    beginResize('se', ptr(0, 0))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 20, clientY: 20 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 999, clientY: 999 }))
    // The post-release move is ignored: size stays at what the release captured.
    expect(size.width).toBe(640)
    expect(size.height).toBe(440)
  })
})
