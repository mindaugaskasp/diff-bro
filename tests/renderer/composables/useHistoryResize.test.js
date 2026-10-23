import { beforeEach, describe, expect, it } from 'vitest'
import { useHistoryResize } from '../../../src/renderer/src/composables/useHistoryResize'
import { HISTORY_W } from '../../../src/renderer/src/utils/historyWidth'

const stored = () => JSON.parse(localStorage.getItem('diffbro.historyPanel') ?? '{}')
const move = (x) => window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: x }))
const space = () => 1200

beforeEach(() => {
  localStorage.clear()
  window.api = {}
})

describe('useHistoryResize', () => {
  it('starts at the designed width', () => {
    expect(useHistoryResize(space).width.value).toBe(HISTORY_W)
  })

  // The grip is on the LEFT edge, so dragging left widens the panel.
  it('widens as the grip moves left and narrows as it moves right', () => {
    const r = useHistoryResize(space)
    r.start({ clientX: 800 })
    move(760)
    expect(r.width.value).toBe(HISTORY_W + 40)
    move(840)
    expect(r.width.value).toBe(HISTORY_W - 40)
    r.end()
  })

  it('stops at 60% of the space it lives in', () => {
    const r = useHistoryResize(space)
    r.start({ clientX: 800 })
    move(0)
    expect(r.width.value).toBe(720)
    r.end()
  })

  it('writes the width on release, not per move', () => {
    const r = useHistoryResize(space)
    r.start({ clientX: 800 })
    move(700)
    expect(stored().width).toBeUndefined()
    window.dispatchEvent(new window.PointerEvent('pointerup'))
    expect(stored().width).toBe(HISTORY_W + 100)
  })

  it('a reset puts the designed width back and remembers that', () => {
    const r = useHistoryResize(space)
    r.start({ clientX: 800 })
    move(700)
    r.end()
    r.reset()
    expect(r.width.value).toBe(HISTORY_W)
    expect(stored().width).toBe(HISTORY_W)
  })

  it('ignores moves that arrive without a press', () => {
    const r = useHistoryResize(space)
    move(100)
    expect(r.width.value).toBe(HISTORY_W)
  })
})
