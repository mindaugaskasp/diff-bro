import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useVirtualRows } from '../../../src/renderer/src/composables/useVirtualRows'

// A stand-in scrolling box: jsdom lays nothing out, so the geometry is supplied.
const box = (over = {}) => ({
  scrollTop: 0,
  clientHeight: 360,
  scrollHeight: 100000,
  addEventListener() {},
  removeEventListener() {},
  ...over
})

let observed
beforeEach(() => {
  observed = []
  globalThis.ResizeObserver = class {
    observe(el) {
      observed.push(el)
    }
    disconnect() {
      observed = observed.filter((e) => !e)
    }
  }
})
afterEach(() => {
  delete globalThis.ResizeObserver
})

describe('useVirtualRows', () => {
  it('renders a window far smaller than the list', async () => {
    const el = ref(box())
    const view = useVirtualRows(el, 500_000, 18)
    await nextTick()
    expect(view.value.end - view.value.start).toBeLessThan(100)
    expect(view.value.padBottom).toBeGreaterThan(0)
  })

  // The bug this guards: the scrolling box sits behind a v-if (indexing, an
  // error), so it does not exist when the component mounts. Measuring only at
  // that moment left the viewport at zero and the observer on nothing, which
  // renders one overscan's worth of rows forever.
  it('measures the box when it appears LATER, not just on mount', async () => {
    const el = ref(null)
    const view = useVirtualRows(el, 500_000, 18)
    await nextTick()
    const before = view.value.end - view.value.start
    expect(observed).toHaveLength(0)

    el.value = box({ clientHeight: 720 })
    await nextTick()

    expect(observed).toHaveLength(1)
    // The window is now derived from the box's real height, not the
    // before-layout fallback it had while there was nothing to measure.
    expect(view.value.end - view.value.start).not.toBe(before)
    expect(view.value.padBottom).toBe((500_000 - view.value.end) * 18)
  })

  it('re-measures when the total changes, so a new comparison starts at the top', async () => {
    const el = ref(box({ scrollTop: 9000 }))
    const total = ref(500_000)
    const view = useVirtualRows(el, total, 18)
    await nextTick()
    expect(view.value.start).toBeGreaterThan(0)

    // A fresh comparison: the element's scroll really is back at the top.
    el.value.scrollTop = 0
    total.value = 1200
    await nextTick()
    expect(view.value.start).toBe(0)
  })

  it('follows the box on scroll', async () => {
    let onScroll = null
    const el = ref(box({ addEventListener: (_e, fn) => (onScroll = fn) }))
    const view = useVirtualRows(el, 500_000, 18)
    await nextTick()
    el.value.scrollTop = 18_000
    onScroll()
    await nextTick()
    expect(view.value.start).toBeGreaterThan(900)
    expect(view.value.padTop).toBe(view.value.start * 18)
  })

  it('reports the whole list height, not the rendered window', async () => {
    const view = useVirtualRows(ref(box()), 4_000_000, 18)
    await nextTick()
    const { start, end, padTop, padBottom } = view.value
    expect(padTop + (end - start) * 18 + padBottom).toBe(72_000_000)
  })

  it('survives an environment with no ResizeObserver', async () => {
    delete globalThis.ResizeObserver
    const el = ref(null)
    const view = useVirtualRows(el, 100, 18)
    el.value = box()
    await expect(nextTick()).resolves.not.toThrow()
    expect(view.value.end).toBeGreaterThan(0)
  })

  it('accepts a plain number total as readily as a ref', async () => {
    // A list shorter than the viewport renders whole, with no bottom spacer.
    const view = useVirtualRows(ref(box()), 12, 18)
    await nextTick()
    expect(view.value.end).toBe(12)
    expect(view.value.padBottom).toBe(0)
  })

  // A list shorter than the viewport needs no spacers at all.
  it('renders a short list whole', async () => {
    const view = useVirtualRows(ref(box()), 10, 18)
    await nextTick()
    expect(view.value).toEqual({ start: 0, end: 10, padTop: 0, padBottom: 0 })
  })
})
