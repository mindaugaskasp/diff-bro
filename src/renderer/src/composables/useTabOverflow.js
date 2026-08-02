// Keeps the tab strip's overflow state in step with its contents, so the
// chevrons appear exactly when there is something off-screen, and keeps the
// active tab in view. The arithmetic is pure (utils/tabStrip).
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isOverflowing } from '../utils/tabStrip'

/**
 * @param {import('vue').Ref<HTMLElement|null>} track
 * @param {() => string} activeId
 */
export function useTabOverflow(track, activeId) {
  const overflowing = ref(false)
  const measure = () => (overflowing.value = isOverflowing(track.value))

  // Stepping to a tab has to bring it into view, or the strip walks somewhere
  // the reader cannot see.
  const revealActive = () => {
    track.value
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    measure()
  }

  let observer = null
  onMounted(() => {
    measure()
    observer = new ResizeObserver(measure)
    if (track.value) observer.observe(track.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  watch(activeId, () => requestAnimationFrame(revealActive))

  return { overflowing, measure, revealActive }
}
