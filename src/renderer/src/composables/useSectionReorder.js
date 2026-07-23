import { ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

// Drag-and-drop reordering of the sidebar sections. The drag source and the drop
// target are different SectionHeader instances, so the id of the section being
// dragged lives in a module-level ref shared across them all. The reorder maths
// itself is the store's reorderSections (unit-tested); this is only the wiring,
// pulled out of the .vue so the drag guards can be exercised without mounting.
const dragId = ref(null)

export function useSectionReorder() {
  const settings = useSettingsStore()

  function onDragStart(id, e) {
    if (settings.sectionsLocked) return
    dragId.value = id
    // Some browsers only start a drag once dataTransfer is populated.
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    }
  }
  function onDragEnd() {
    dragId.value = null
  }
  function onDrop(targetId) {
    const from = dragId.value
    dragId.value = null
    if (from) settings.reorderSections(from, targetId)
  }
  // True for a section that is a live drop target (a drag is in flight and this
  // isn't the section being dragged) — drives the drop-highlight class.
  function isDropTarget(id) {
    return dragId.value !== null && dragId.value !== id
  }

  return { dragId, onDragStart, onDragEnd, onDrop, isDropTarget }
}
