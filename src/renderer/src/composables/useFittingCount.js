import { onBeforeUnmount, onMounted, ref } from 'vue'
import { fittingCount } from '../utils/railFit'

/**
 * Track how many items fit a box as it resizes. The rail uses it to draw as many
 * recent tools as its leftover column holds — a fixed count either wastes the
 * space on a tall window or is clipped on a short one.
 * @param {import('vue').Ref<Element|null>} boxRef
 * @param {{ item: () => number, max: () => number }} opts
 * @returns {import('vue').Ref<number>}
 */
export function useFittingCount(boxRef, { item, max }) {
  const count = ref(0)
  let observer = null
  const measure = () => {
    const el = boxRef.value
    count.value = el ? fittingCount({ height: el.clientHeight, item: item(), max: max() }) : 0
  }
  onMounted(() => {
    measure()
    if (typeof ResizeObserver !== 'function') return
    observer = new ResizeObserver(measure)
    if (boxRef.value) observer.observe(boxRef.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return count
}
