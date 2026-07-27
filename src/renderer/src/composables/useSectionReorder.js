import { ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

// Drag-and-drop reordering of the sidebar sections. The drag source and the drop
// target are different SectionHeader instances, so the id of the section being
// dragged lives in a module-level ref shared across them all. The reorder maths
// itself is the store's reorderSections (unit-tested); this is only the wiring,
// pulled out of the .vue so the drag guards can be exercised without mounting.
const dragId = ref(null)
// The header the cursor is currently over during a drag — so the drop indicator
// follows the cursor to ONE header instead of lighting up all of them.
const hoverId = ref(null)
// The section that just changed position (drag OR arrow), so its header can
// pulse briefly and the reorder registers at a glance without reading labels.
// Cleared on a timer; module-level like dragId, so only one settles at a time.
const movedId = ref(null)
let settleTimer = null

function flagMoved(id) {
  movedId.value = id
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    if (movedId.value === id) movedId.value = null
  }, 650)
}

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
  // Fired continuously by dragover on whichever header is under the cursor.
  function onDragOver(id) {
    if (dragId.value !== null) hoverId.value = id
  }
  function onDragEnd() {
    dragId.value = null
    hoverId.value = null
  }
  function onDrop(targetId) {
    const from = dragId.value
    dragId.value = null
    hoverId.value = null
    if (from && from !== targetId) {
      settings.reorderSections(from, targetId)
      flagMoved(from)
    }
  }
  // The single header the section would drop before: a drag is in flight, the
  // cursor is over THIS header, and it isn't the one being dragged.
  function isDropTarget(id) {
    return dragId.value !== null && id === hoverId.value && id !== dragId.value
  }
  // The header currently being dragged (so it can dim to show what's moving).
  function isDragging(id) {
    return dragId.value === id
  }
  // The header that just settled into a new position (pulse target).
  function isSettling(id) {
    return movedId.value === id
  }

  return {
    dragId,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDrop,
    isDropTarget,
    isDragging,
    isSettling
  }
}
