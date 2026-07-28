import { ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

// Drag-reorder of sidebar sections. Source and target are different
// SectionHeaders, so the dragged/hovered/moved ids are module-level refs shared
// across them; the reorder maths is the store's reorderSections.
const dragId = ref(null)
const hoverId = ref(null)
// The section that just moved (drag or arrow), so its header pulses briefly.
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
  function isDropTarget(id) {
    return dragId.value !== null && id === hoverId.value && id !== dragId.value
  }
  function isDragging(id) {
    return dragId.value === id
  }
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
