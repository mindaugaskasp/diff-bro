import { onBeforeUnmount, onMounted } from 'vue'
import { elementScroller, getDiffScroller, setDiffScroller } from '../utils/diffScroller'

/**
 * Offer a viewer's scrolling box to the image export, and take it back on
 * unmount. Registering is what makes a viewer photographable at all: the export
 * scrolls the region a viewport at a time and stitches the shots, because
 * capturePage only ever sees what is composited.
 *
 * Dropping it on unmount is not tidiness — a stale scroller would have the next
 * export scrolling an element that is no longer on screen. What it hands back is
 * whatever held the slot BEFORE: a snippet stage sits over a live viewer that
 * stays mounted and never re-registers, so clearing the slot would leave the
 * diff underneath unphotographable.
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
