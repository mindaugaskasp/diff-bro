import { computed, ref } from 'vue'

// Zoom (buttons / wheel / trackpad pinch) + drag-to-pan for the Mermaid stages.
const SCALE_MIN = 0.2
const SCALE_MAX = 8
const MAX_WHEEL_STEP = 0.25

export function useZoomPan() {
  const scale = ref(1)
  const tx = ref(0)
  const ty = ref(0)
  const pct = computed(() => Math.round(scale.value * 100))

  const clamp = (v) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, v))
  function zoom(factor) {
    scale.value = clamp(scale.value * factor)
  }
  function fit() {
    scale.value = 1
    tx.value = 0
    ty.value = 0
  }
  // Any wheel zooms, whichever gesture produced it: a mouse wheel arrives plain,
  // a macOS trackpad pinch arrives as a ctrlKey wheel with much smaller deltas.
  // Panning is a drag, so the stage does not need the wheel for scrolling.
  // Proportional to the delta — a fixed step per event made a pinch (which fires
  // dozens of tiny events) race across the whole range — and capped so one mouse
  // flick cannot either.
  function onWheel(e) {
    e.preventDefault()
    const step = Math.min(MAX_WHEEL_STEP, Math.abs(e.deltaY) * (e.ctrlKey ? 0.01 : 0.002))
    zoom(e.deltaY < 0 ? 1 + step : 1 / (1 + step))
  }

  let dragging = false
  let startX = 0
  let startY = 0
  function onDown(e) {
    dragging = true
    startX = e.clientX - tx.value
    startY = e.clientY - ty.value
  }
  function onMove(e) {
    if (!dragging) return
    tx.value = e.clientX - startX
    ty.value = e.clientY - startY
  }
  function onUp() {
    dragging = false
  }

  return { scale, tx, ty, pct, zoom, fit, onWheel, onDown, onMove, onUp }
}
