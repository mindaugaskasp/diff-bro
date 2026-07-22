import { describe, expect, it, vi } from 'vitest'
import { useBackdropClose } from '../../../src/renderer/src/composables/useBackdropClose'

// A minimal event: what matters is where it started (pointerdown target) and
// where the click landed (click target) relative to the backdrop.
const backdrop = { id: 'backdrop' }
const panel = { id: 'panel' }
const ev = (target) => ({ target, currentTarget: backdrop })

describe('useBackdropClose', () => {
  it('closes when the press and the click both land on the backdrop', () => {
    const close = vi.fn()
    const { onPointerDown, onClick } = useBackdropClose(close)
    onPointerDown(ev(backdrop))
    onClick(ev(backdrop))
    expect(close).toHaveBeenCalledTimes(1)
  })

  // The regression: a resize drag begins on the panel and releases over the
  // backdrop, so the click target is the backdrop. It must NOT close.
  it('does not close when a drag starts on the panel and releases on the backdrop', () => {
    const close = vi.fn()
    const { onPointerDown, onClick } = useBackdropClose(close)
    onPointerDown(ev(panel)) // press began inside the panel (resize handle)
    onClick(ev(backdrop)) // click bubbles to the backdrop after the drag
    expect(close).not.toHaveBeenCalled()
  })

  it('does not close on a click that bubbles up from inside the panel', () => {
    const close = vi.fn()
    const { onPointerDown, onClick } = useBackdropClose(close)
    onPointerDown(ev(backdrop))
    onClick(ev(panel))
    expect(close).not.toHaveBeenCalled()
  })

  it('re-arms each interaction: a real backdrop click still closes after a drag', () => {
    const close = vi.fn()
    const { onPointerDown, onClick } = useBackdropClose(close)
    onPointerDown(ev(panel))
    onClick(ev(backdrop)) // drag release — no close
    onPointerDown(ev(backdrop))
    onClick(ev(backdrop)) // deliberate backdrop click — closes
    expect(close).toHaveBeenCalledTimes(1)
  })
})
