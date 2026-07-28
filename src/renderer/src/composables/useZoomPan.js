import { computed, ref } from 'vue'

// Zoom (buttons / Ctrl-wheel) + drag-to-pan for the Mermaid viewer stage.
const SCALE_MIN = 0.2
const SCALE_MAX = 8

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
  function onWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return // plain scroll left for the OS/trackpad
    e.preventDefault()
    zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1)
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
