import { ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

// Drag-reorder of sidebar sections, on pointer events: HTML5 dnd carries a
// payload between documents, and a section never leaves the sidebar — all it
// bought was Chromium's refusal to start a native drag on Windows for an element
// with `user-select: none`, which this header is the app's only one to have.
//
// Source and target are different SectionHeaders, so the gesture's ids are
// module-level refs shared across them.
const dragId = ref(null)
const hoverId = ref(null)
// The section that just moved (drag or arrow), so its header pulses briefly.
const movedId = ref(null)
let settleTimer = null

// Press bookkeeping, before the gesture is known to be a drag.
let pressId = null
let pressAt = null
// A drag ends with a click event the header would otherwise take as "collapse
// me". Consumed by the next click, never left set.
const clickSuppressed = ref(false)

// Below this the gesture is a click, not a drag — without it every collapse
// toggle would reorder whatever it landed on.
const DRAG_THRESHOLD_PX = 4

function flagMoved(id) {
  movedId.value = id
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    if (movedId.value === id) movedId.value = null
  }, 650)
}

// The header under the cursor. Pointer capture retargets the EVENTS to the
// source, so the target has to come from a hit test rather than from e.target.
function sectionUnder(x, y) {
  return document.elementFromPoint(x, y)?.closest('[data-section]')?.dataset.section ?? null
}

const travelled = (e) => Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y)

// A header carries its own controls (New snippet, the star, the disclosure). A
// press that starts on one of those is aimed at the control, not at the handle.
const isOwnControl = (target) =>
  !!target?.closest?.('button, input, select, textarea, a, [role="button"]')

function endGesture() {
  dragId.value = null
  hoverId.value = null
  pressId = null
  pressAt = null
}

// Escape mid-drag, or the OS taking the pointer away: leave the order alone.
// No click follows a cancel, so there is nothing to suppress.
const onCancel = endGesture

function onPointerMove(e) {
  if (pressId === null) return
  if (dragId.value === null) {
    if (travelled(e) < DRAG_THRESHOLD_PX) return
    dragId.value = pressId
    // Captured HERE, not on the press. Capture retargets pointerup to this
    // header, and a pointerup a control never receives is a click Chromium never
    // fires — capturing on press silently killed every button in the header. By
    // now the gesture is known to be a drag, so there is no click left to lose.
    e.currentTarget?.setPointerCapture?.(e.pointerId)
  }
  hoverId.value = sectionUnder(e.clientX, e.clientY)
}

// Asked once by the click that follows a drag, and cleared by the asking.
function consumeClickSuppression() {
  if (!clickSuppressed.value) return false
  clickSuppressed.value = false
  return true
}

const isDropTarget = (id) => dragId.value !== null && id === hoverId.value && id !== dragId.value
const isDragging = (id) => dragId.value === id
const isSettling = (id) => movedId.value === id

export function useSectionReorder() {
  const settings = useSettingsStore()

  function onPointerDown(id, e) {
    // Cleared FIRST, and unconditionally: a press the window never sees the end
    // of (focus lost mid-gesture) would otherwise leave this armed, and the next
    // unrelated move would finish a drag nobody started. Same for a suppression
    // whose click never arrived — it must not eat this gesture's.
    endGesture()
    clickSuppressed.value = false
    if (settings.sectionsLocked || e.button !== 0 || isOwnControl(e.target)) return
    pressId = id
    pressAt = { x: e.clientX, y: e.clientY }
  }

  function onPointerUp(e) {
    const from = dragId.value
    const target = from === null ? null : sectionUnder(e.clientX, e.clientY)
    endGesture()
    if (from === null) return
    // A drag happened, so the click it is about to fire is not a collapse.
    clickSuppressed.value = true
    if (target && target !== from) {
      settings.reorderSections(from, target)
      flagMoved(from)
    }
  }

  return {
    dragId,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onCancel,
    consumeClickSuppression,
    isDropTarget,
    isDragging,
    isSettling
  }
}
