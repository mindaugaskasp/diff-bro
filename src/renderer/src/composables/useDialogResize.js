import { computed, reactive } from 'vue'
import { resizeCentered } from '../utils/dialogResize'

// Drives a centered dialog's edge/corner resize (geometry is the pure
// resizeCentered). A null width/height means "use the CSS default until dragged".

// Clamp so the persisted number stays sane (the CSS max also caps it).
const MAX_FRACTION = 0.94

export function useDialogResize({
  panel,
  width,
  initial,
  min = { width: 320, height: 240 },
  maximized,
  onResize
}) {
  const size = reactive({
    width: initial?.width ?? null,
    height: initial?.height ?? null
  })

  const style = computed(() => {
    // Maximized: fill the window (capped by the dialog's CSS max).
    if (maximized?.()) return { width: '100vw', height: '100vh' }
    return {
      width: size.width != null ? `${size.width}px` : width || null,
      height: size.height != null ? `${size.height}px` : null
    }
  })

  const maxSize = () => ({
    width: Math.round(window.innerWidth * MAX_FRACTION),
    height: Math.round(window.innerHeight * MAX_FRACTION)
  })

  function beginResize(handle, e) {
    e.preventDefault()
    e.stopPropagation()
    const startW = panel.value.offsetWidth
    const startH = panel.value.offsetHeight
    const startX = e.clientX
    const startY = e.clientY
    const max = maxSize()
    const onMove = (ev) => {
      const next = resizeCentered({
        handle,
        startW,
        startH,
        dx: ev.clientX - startX,
        dy: ev.clientY - startY,
        min,
        max
      })
      size.width = next.width
      size.height = next.height
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      onResize({ width: size.width, height: size.height })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { size, style, beginResize }
}
