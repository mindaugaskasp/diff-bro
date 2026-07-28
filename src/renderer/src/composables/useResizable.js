import { reactive } from 'vue'
import { resizeRect, centeredRect } from '../utils/resizeRect'

// A panel dragged from any corner, clamped inside the viewport (geometry is the
// pure resizeRect). MARGIN keeps it from going fully off-screen.
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

  // The opposite corner is pinned, so start rect + bounds are captured once.
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
