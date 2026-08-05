import { describe, expect, it, vi } from 'vitest'
import { useZoomPan } from '../../../src/renderer/src/composables/useZoomPan'

// The wheel handler is the whole reason this lives outside the SFC: two stages
// bind it (DiagramDiffViewer, MermaidViewerDialog), and it has to serve two
// gestures whose deltas differ by an order of magnitude — a mouse wheel's few
// large events and a trackpad pinch's dozens of tiny ctrlKey ones.
const wheel = (deltaY, ctrlKey = false) => ({ deltaY, ctrlKey, preventDefault: vi.fn() })

describe('useZoomPan', () => {
  it('starts unzoomed and un-panned', () => {
    const z = useZoomPan()
    expect(z.scale.value).toBe(1)
    expect(z.pct.value).toBe(100)
    expect([z.tx.value, z.ty.value]).toEqual([0, 0])
  })

  // A plain wheel used to be ignored outright, so a mouse could not zoom at all.
  it('zooms on a plain mouse wheel, both directions', () => {
    const z = useZoomPan()
    const up = wheel(-100)
    z.onWheel(up)
    expect(up.preventDefault).toHaveBeenCalled()
    expect(z.scale.value).toBeGreaterThan(1)

    const down = wheel(100)
    z.onWheel(down)
    expect(z.scale.value).toBeCloseTo(1, 5)
  })

  it('zooms on a trackpad pinch, which arrives as a ctrlKey wheel', () => {
    const z = useZoomPan()
    z.onWheel(wheel(-4, true))
    expect(z.scale.value).toBeGreaterThan(1)
  })

  // The reason the step is proportional: a pinch fires many small events, so a
  // fixed step per event raced across the whole range in one gesture.
  it('takes a smaller step for a smaller delta', () => {
    const big = useZoomPan()
    const small = useZoomPan()
    big.onWheel(wheel(-100))
    small.onWheel(wheel(-10))
    expect(big.scale.value).toBeGreaterThan(small.scale.value)
  })

  it('caps one event so a single flick cannot cross the range', () => {
    const z = useZoomPan()
    z.onWheel(wheel(-100000))
    expect(z.scale.value).toBeLessThanOrEqual(1.25)
  })

  it('clamps to the scale range however far it is pushed', () => {
    const z = useZoomPan()
    for (let i = 0; i < 200; i++) z.onWheel(wheel(-100))
    expect(z.scale.value).toBe(8)
    for (let i = 0; i < 400; i++) z.onWheel(wheel(100))
    expect(z.scale.value).toBe(0.2)
  })

  it('pans by drag, and only while the pointer is down', () => {
    const z = useZoomPan()
    z.onMove({ clientX: 50, clientY: 50 }) // no drag started — ignored
    expect([z.tx.value, z.ty.value]).toEqual([0, 0])

    z.onDown({ clientX: 10, clientY: 10 })
    z.onMove({ clientX: 40, clientY: 25 })
    expect([z.tx.value, z.ty.value]).toEqual([30, 15])

    z.onUp()
    z.onMove({ clientX: 999, clientY: 999 })
    expect([z.tx.value, z.ty.value]).toEqual([30, 15])
  })

  it('fit returns to 100% and re-centres', () => {
    const z = useZoomPan()
    z.onWheel(wheel(-100))
    z.onDown({ clientX: 0, clientY: 0 })
    z.onMove({ clientX: 60, clientY: 20 })
    z.fit()
    expect(z.scale.value).toBe(1)
    expect([z.tx.value, z.ty.value]).toEqual([0, 0])
  })
})
