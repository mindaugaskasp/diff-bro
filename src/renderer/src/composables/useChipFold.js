import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fittingCount } from '../utils/chipFold'

const MORE_CHIP = 40

/**
 * @param {import('vue').Ref<HTMLElement|null>} row
 * @param {() => unknown} watched  re-measure when this changes (the tag list)
 * @param {boolean} enabled
 */
export function useChipFold(row, watched, enabled) {
  const shown = ref(Infinity)
  async function measure() {
    await nextTick()
    const el = row.value
    if (!enabled || !el) return
    const chips = [...el.querySelectorAll(':scope > .etag')]
    const tail = el.querySelector(':scope > .add-pill')?.offsetWidth ?? 0
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    shown.value = fittingCount({
      widths: chips.map((chip) => chip.offsetWidth),
      room: el.clientWidth,
      gap,
      tail,
      more: MORE_CHIP
    })
  }
  let observer = null
  onMounted(() => {
    if (!enabled) return
    observer = new ResizeObserver(measure)
    observer.observe(row.value)
    measure()
  })
  onBeforeUnmount(() => observer?.disconnect())
  watch(watched, measure, { deep: true })
  return { shown }
}
