import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, ref } from 'vue'
import { useCaptureRegion } from '../../../src/renderer/src/composables/useCaptureRegion'
import { getDiffScroller, setDiffScroller } from '../../../src/renderer/src/utils/diffScroller'

// The composable only runs inside a component, so mount a render-less one and
// hand back its unmount — the half of the contract that actually broke.
function mountWith(setup) {
  const app = createApp({
    setup() {
      setup()
      return () => h('div')
    }
  })
  const el = document.createElement('div')
  document.body.append(el)
  app.mount(el)
  return () => {
    app.unmount()
    el.remove()
  }
}

afterEach(() => {
  setDiffScroller(null)
  document.body.innerHTML = ''
})

describe('useCaptureRegion', () => {
  it('registers its own scrolling box while it is mounted', () => {
    const box = ref(document.createElement('div'))
    const unmount = mountWith(() => useCaptureRegion(box))
    expect(getDiffScroller()?.viewportEl()).toBe(box.value)
    unmount()
  })

  // A snippet stage sits OVER a live DiffViewer, which stays mounted and never
  // re-registers. Clearing the slot instead of handing it back left the diff
  // unphotographable for the rest of its life.
  it('gives the region back to the viewer underneath when it unmounts', () => {
    const viewer = { viewportEl: () => null }
    setDiffScroller(viewer)

    const unmount = mountWith(() => useCaptureRegion(ref(document.createElement('div'))))
    expect(getDiffScroller()).not.toBe(viewer)

    unmount()
    expect(getDiffScroller()).toBe(viewer)
  })

  it('leaves the slot empty when nothing held it before', () => {
    const unmount = mountWith(() => useCaptureRegion(ref(document.createElement('div'))))
    unmount()
    expect(getDiffScroller()).toBeNull()
  })
})
