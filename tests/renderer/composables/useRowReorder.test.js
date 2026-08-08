// The reorder gesture, without a DOM. What makes this worth its own unit is
// the STATE between events: which group the drag started in, and whether the
// pointer is in the top or the bottom half of the row it is over.
import { describe, expect, it, vi } from 'vitest'
import { useRowReorder } from '../../../src/renderer/src/composables/useRowReorder'

const dragEvent = (over = {}) => ({
  dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn(), setDragImage: vi.fn() },
  preventDefault: vi.fn(),
  clientY: 0,
  currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 20 }) },
  ...over
})

const setup = (over = {}) => {
  const commit = vi.fn()
  const reorder = useRowReorder({ commit, ...over })
  return { reorder, commit }
}

describe('useRowReorder — where the drop lands', () => {
  it('drops ABOVE the row when the pointer is in its top half', () => {
    const { reorder, commit } = setup()
    reorder.onDragStart(dragEvent(), { group: 'snippets', index: 3 })
    reorder.onDragOver(dragEvent({ clientY: 4 }), { group: 'snippets', index: 0 })
    reorder.onDrop(dragEvent({ clientY: 4 }), { group: 'snippets', index: 0 })
    expect(commit).toHaveBeenCalledWith('snippets', 3, 0)
  })

  it('drops BELOW it when the pointer is in the bottom half', () => {
    const { reorder, commit } = setup()
    reorder.onDragStart(dragEvent(), { group: 'snippets', index: 3 })
    reorder.onDrop(dragEvent({ clientY: 16 }), { group: 'snippets', index: 0 })
    expect(commit).toHaveBeenCalledWith('snippets', 3, 1)
  })
})

// The favourite boundary needs no guard of its own: each group is its own list,
// so confining a drag to the list it started in IS the rule.
describe('useRowReorder — a drag stays in its group', () => {
  it('refuses a drop in a different group', () => {
    const { reorder, commit } = setup()
    reorder.onDragStart(dragEvent(), { group: 'favorites', index: 0 })
    reorder.onDrop(dragEvent({ clientY: 4 }), { group: 'snippets', index: 2 })
    expect(commit).not.toHaveBeenCalled()
  })

  it('marks no row as a target while over a foreign group', () => {
    const { reorder } = setup()
    reorder.onDragStart(dragEvent(), { group: 'favorites', index: 0 })
    reorder.onDragOver(dragEvent({ clientY: 4 }), { group: 'snippets', index: 2 })
    expect(reorder.markerFor('snippets', 2)).toBe('')
  })

  it('ignores a drop that no drag of ours started', () => {
    const { reorder, commit } = setup()
    reorder.onDrop(dragEvent({ clientY: 4 }), { group: 'snippets', index: 0 })
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('useRowReorder — dropping on itself', () => {
  it('does nothing when the row would not move', () => {
    const { reorder, commit } = setup()
    reorder.onDragStart(dragEvent(), { group: 'snippets', index: 2 })
    reorder.onDrop(dragEvent({ clientY: 4 }), { group: 'snippets', index: 2 })
    expect(commit).not.toHaveBeenCalled()
  })

  it('also does nothing dropping into the gap just below itself', () => {
    const { reorder, commit } = setup()
    reorder.onDragStart(dragEvent(), { group: 'snippets', index: 2 })
    reorder.onDrop(dragEvent({ clientY: 16 }), { group: 'snippets', index: 2 })
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('useRowReorder — the indicator', () => {
  it('marks the row the pointer is over, above or below', () => {
    const { reorder } = setup()
    reorder.onDragStart(dragEvent(), { group: 'snippets', index: 0 })
    reorder.onDragOver(dragEvent({ clientY: 4 }), { group: 'snippets', index: 2 })
    expect(reorder.markerFor('snippets', 2)).toBe('above')
    reorder.onDragOver(dragEvent({ clientY: 16 }), { group: 'snippets', index: 2 })
    expect(reorder.markerFor('snippets', 2)).toBe('below')
  })

  it('marks nothing once the drag ends', () => {
    const { reorder } = setup()
    reorder.onDragStart(dragEvent(), { group: 'snippets', index: 0 })
    reorder.onDragOver(dragEvent({ clientY: 4 }), { group: 'snippets', index: 2 })
    reorder.onDragEnd()
    expect(reorder.markerFor('snippets', 2)).toBe('')
  })

  // A drop is an exit path too, and the one that used to leave a line behind.
  it('marks nothing after a drop', () => {
    const { reorder } = setup()
    reorder.onDragStart(dragEvent(), { group: 'snippets', index: 0 })
    reorder.onDragOver(dragEvent({ clientY: 4 }), { group: 'snippets', index: 2 })
    reorder.onDrop(dragEvent({ clientY: 4 }), { group: 'snippets', index: 2 })
    expect(reorder.markerFor('snippets', 2)).toBe('')
  })

  it('never marks the row being dragged', () => {
    const { reorder } = setup()
    reorder.onDragStart(dragEvent(), { group: 'snippets', index: 2 })
    reorder.onDragOver(dragEvent({ clientY: 4 }), { group: 'snippets', index: 2 })
    expect(reorder.markerFor('snippets', 2)).toBe('')
  })
})

describe('useRowReorder — the payload', () => {
  // The row is already an HTML5 drag source for "drop into the pane to
  // compare", so the reorder has to travel under its OWN type or a reorder
  // drag would open the row it was dragged past.
  it('sets its own drag type, not the compare one', () => {
    const { reorder } = setup()
    const e = dragEvent()
    reorder.onDragStart(e, { group: 'snippets', index: 0 })
    expect(e.dataTransfer.setData).toHaveBeenCalledWith(
      'application/x-diffbro-reorder',
      'snippets:0'
    )
  })

  it('reports a reorder in flight, so the compare drop can stand down', () => {
    const { reorder } = setup()
    expect(reorder.isReordering.value).toBe(false)
    reorder.onDragStart(dragEvent(), { group: 'snippets', index: 0 })
    expect(reorder.isReordering.value).toBe(true)
    reorder.onDragEnd()
    expect(reorder.isReordering.value).toBe(false)
  })
})
