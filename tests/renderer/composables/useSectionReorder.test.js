import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSectionReorder } from '../../../src/renderer/src/composables/useSectionReorder'
import { useSettingsStore, SECTIONS } from '../../../src/renderer/src/stores/settingsStore'

// A drag event carrying a spyable dataTransfer.
const dragEvent = () => ({ dataTransfer: { effectAllowed: '', setData: vi.fn() } })

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('useSectionReorder', () => {
  it('a full drag from one header to another reorders the sections', () => {
    const r = useSectionReorder()
    const e = dragEvent()
    r.onDragStart('snippets', e)
    expect(e.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'snippets')
    r.onDrop('saved') // dropped before "saved"
    expect(useSettingsStore().sectionOrder).toEqual(['snippets', 'saved', 'external'])
  })

  it('marks only the hovered header as the drop target, following the cursor', () => {
    const r = useSectionReorder()
    expect(r.isDropTarget('saved')).toBe(false) // nothing dragging yet
    r.onDragStart('saved', dragEvent())
    expect(r.isDragging('saved')).toBe(true)
    // Before the cursor is over any header, nothing is marked.
    expect(r.isDropTarget('external')).toBe(false)
    // Hover external → only it is the target; the dragged one never is.
    r.onDragOver('external')
    expect(r.isDropTarget('external')).toBe(true)
    expect(r.isDropTarget('snippets')).toBe(false)
    expect(r.isDropTarget('saved')).toBe(false)
    // Move the cursor to snippets → the marker follows.
    r.onDragOver('snippets')
    expect(r.isDropTarget('snippets')).toBe(true)
    expect(r.isDropTarget('external')).toBe(false)
    r.onDragEnd()
    expect(r.isDropTarget('snippets')).toBe(false)
    expect(r.isDragging('saved')).toBe(false)
  })

  it('does nothing while the order is locked', () => {
    useSettingsStore().toggleSectionsLock()
    const r = useSectionReorder()
    r.onDragStart('snippets', dragEvent()) // refused: no drag begins
    expect(r.isDropTarget('saved')).toBe(false)
    r.onDrop('saved')
    expect(useSettingsStore().sectionOrder).toEqual(SECTIONS)
  })
})
