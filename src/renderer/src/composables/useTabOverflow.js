// Keeps the tab strip's scroll state in step with its contents, so the chevrons
// appear exactly when there is something off-screen. The arithmetic is pure
// (utils/tabStrip); this owns the observers and the scrolling.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { stripScroll } from '../utils/tabStrip'

// Roughly two tabs at the 20ch floor — a page, not a nudge.
const STEP = 240

/**
 * @param {import('vue').Ref<HTMLElement|null>} track
 * @param {() => string} activeId
 */
export function useTabOverflow(track, activeId) {
  const state = ref({ overflowing: false, atStart: true, atEnd: true })
  const measure = () => (state.value = stripScroll(track.value))

  const by = (delta) => {
    track.value?.scrollBy({ left: delta, behavior: 'auto' })
    measure()
  }
  const scrollLeft = () => by(-STEP)
  const scrollRight = () => by(STEP)

  // Stepping to a tab with the accelerator has to bring it into view, or the
  // strip walks somewhere the reader cannot see.
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

  return { state, measure, scrollLeft, scrollRight, revealActive }
}
