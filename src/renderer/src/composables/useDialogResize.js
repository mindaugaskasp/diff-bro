import { computed, reactive } from 'vue'
import { resizeCentered } from '../utils/dialogResize'

// Drives a centered dialog's edge/corner resize: it owns the live size, exposes
// the inline style for the panel, and wires each handle's pointer drag. The
// geometry is the pure resizeCentered (utils/dialogResize); this keeps the drag
// reactive and reports the final size for persistence on release.
//
// A null width/height means "use the dialog's default" (its CSS width, and
// content height) until the user drags — so an un-resized dialog still sizes to
// its content rather than being pinned to a guessed box.

// Never let a dialog grow past almost the whole viewport (the CSS max also caps
// it, but clamping here keeps the persisted number sane).
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
    // Maximized: fill the window. 100vw/100vh is capped by the dialog's CSS
    // max-width/height (92vw/92vh), and turning it off falls straight back to the
    // remembered/default size below since `size` is untouched.
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
