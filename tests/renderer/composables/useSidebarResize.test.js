// The drag itself, without a pointer. What makes this worth a unit is the state
// BETWEEN the events: a move that arrives without a press must do nothing, and a
// release must be what writes.
import { beforeEach, describe, expect, it } from 'vitest'
import { useSidebarResize } from '../../../src/renderer/src/composables/useSidebarResize'
import { SIDEBAR_MAX, SIDEBAR_W } from '../../../src/renderer/src/utils/sidebarWidth'

const stored = () => JSON.parse(localStorage.getItem('diffbro.sidebar') ?? '{}')
const at = (x) => ({ clientX: x })

beforeEach(() => {
  localStorage.clear()
  window.api = {}
})

describe('useSidebarResize', () => {
  it('starts at the designed width on a first run', () => {
    expect(useSidebarResize().width.value).toBe(SIDEBAR_W)
  })

  // The listeners go on the window, so the drag survives the pointer outrunning
  // a 4px grip that the drag itself is moving.
  it('follows the pointer for the whole drag, wherever it goes', () => {
    const r = useSidebarResize()
    r.start(at(300))
    expect(r.resizing.value).toBe(true)

    window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 320 }))
    expect(r.width.value).toBe(SIDEBAR_W + 20)
    window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 340 }))
    expect(r.width.value).toBe(SIDEBAR_W + 40)

    window.dispatchEvent(new window.PointerEvent('pointerup'))
    expect(r.resizing.value).toBe(false)
    expect(stored().width).toBe(SIDEBAR_W + 40)
  })

  it('stops listening once the drag is over', () => {
    const r = useSidebarResize()
    r.start(at(300))
    window.dispatchEvent(new window.PointerEvent('pointerup'))
    window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 900 }))
    expect(r.width.value).toBe(SIDEBAR_W)
  })

  it('stops at the cap however far the pointer goes', () => {
    const r = useSidebarResize()
    r.start(at(300))
    r.drag(at(1600))
    expect(r.width.value).toBe(SIDEBAR_MAX)
  })

  it('never narrows past the designed width', () => {
    const r = useSidebarResize()
    r.start(at(300))
    r.drag(at(40))
    expect(r.width.value).toBe(SIDEBAR_W)
  })

  it('writes on release, not on every frame', () => {
    const r = useSidebarResize()
    r.start(at(300))
    r.drag(at(330))
    expect(localStorage.getItem('diffbro.sidebar')).toBeNull()

    r.end()
    expect(stored().width).toBe(SIDEBAR_W + 30)
    expect(r.resizing.value).toBe(false)
  })

  it('comes back at the width it was left at', () => {
    const r = useSidebarResize()
    r.start(at(300))
    r.drag(at(318))
    r.end()

    expect(useSidebarResize().width.value).toBe(SIDEBAR_W + 18)
  })

  it('ignores a release that no press started', () => {
    useSidebarResize().end()
    expect(localStorage.getItem('diffbro.sidebar')).toBeNull()
  })
})
