import { onBeforeUnmount, onMounted } from 'vue'
import { elementScroller, getDiffScroller, setDiffScroller } from '../utils/diffScroller'

/**
 * Offer a viewer's scrolling box to the image export, and take it back on
 * unmount. Registering is what makes a viewer photographable at all: the export
 * scrolls the region a viewport at a time and stitches the shots, because
 * capturePage only ever sees what is composited.
 *
 * It hands back whatever held the slot BEFORE, not null: a snippet stage sits
 * over a live viewer that stays mounted and never re-registers.
 * @param {import('vue').Ref<Element|null>} elRef
 */
export function useCaptureRegion(elRef) {
  let previous = null
  onMounted(() => {
    previous = getDiffScroller()
    setDiffScroller(elementScroller(() => elRef.value ?? null))
  })
  onBeforeUnmount(() => setDiffScroller(previous))
}
