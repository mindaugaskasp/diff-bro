import { reactive } from 'vue'
import { resizeRect, centeredRect } from '../utils/resizeRect'

// A panel that can be dragged bigger/smaller from any of its four corners and
// stays inside the viewport. Geometry is in utils/resizeRect (unit-tested);
// this wires the pointer drag and keeps the live rect reactive.

// Keep at least this much of the window edge free so the panel can never be
// dragged fully off-screen.
const MARGIN = 8

export function useResizable({ min }) {
  const rect = reactive({ left: 0, top: 0, width: 0, height: 0 })

  const bounds = () => ({
    minX: MARGIN,
    minY: MARGIN,
    maxX: window.innerWidth - MARGIN,
    maxY: window.innerHeight - MARGIN
  })

  // Place a rect of the given size centred in the current window.
  function setCentered(width, height) {
    const w = Math.min(width, window.innerWidth - 2 * MARGIN)
    const h = Math.min(height, window.innerHeight - 2 * MARGIN)
    Object.assign(rect, centeredRect(w, h, window.innerWidth, window.innerHeight))
  }

  // Begin a corner drag. The opposite corner is pinned for the whole gesture, so
  // the start rect and bounds are captured once and every move is computed from
  // the original press point.
  function beginResize(corner, e) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const start = { ...rect }
    const b = bounds()
    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      Object.assign(rect, resizeRect({ rect: start, corner, dx, dy, min, bounds: b }))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { rect, setCentered, beginResize }
}
