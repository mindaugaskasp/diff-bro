import { onBeforeUnmount, ref } from 'vue'
import { loadPersisted, savePersisted } from '../persist'
import { PREVIEW_H, clampPreviewHeight, readPreviewHeight } from '../utils/previewHeight'

const KEY = 'mermaidPreview'

/**
 * Drag-to-heighten for the snippet's diagram preview, from its TOP edge.
 * @param {() => number} space  current height of the column the preview shares
 */
export function usePreviewResize(space) {
  const height = ref(readPreviewHeight(loadPersisted(KEY)))
  const resizing = ref(false)
  let from = 0
  let startY = 0

  const save = () => savePersisted(KEY, JSON.stringify({ height: height.value }))
  const drag = (e) => (height.value = clampPreviewHeight(from - (e.clientY - startY), space()))

  function end() {
    if (!resizing.value) return
    resizing.value = false
    window.removeEventListener('pointermove', drag)
    window.removeEventListener('pointerup', end)
    save()
  }

  function start(e) {
    e.preventDefault?.()
    resizing.value = true
    from = height.value
    startY = e.clientY
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', end)
  }

  function reset() {
    height.value = clampPreviewHeight(PREVIEW_H, space())
    save()
  }

  onBeforeUnmount(end)
  return { height, resizing, start, end, reset }
}
