import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { rowWindow } from '../utils/virtualRows'

/**
 * Keep only the visible slice of a long list in the DOM, with spacers standing
 * in for the rest so the scrollbar still measures the whole thing.
 *
 * Both the scroll position and the viewport height are watched: a pane that is
 * resized (or revealed by a tab switch) has to re-window, or the list keeps the
 * height it had when it was last measured.
 * @param {import('vue').Ref<Element|null>} elRef  the scrolling box
 * @param {import('vue').Ref<number>|(() => number)} total
 * @param {number} rowHeight  every row, exactly
 * @returns {import('vue').ComputedRef<{ start, end, padTop, padBottom }>}
 */
export function useVirtualRows(elRef, total, rowHeight) {
  const scrollTop = ref(0)
  const viewportHeight = ref(0)
  const count = typeof total === 'function' ? computed(total) : total

  let observer = null
  const measure = () => {
    const el = elRef.value
    if (!el) return
    scrollTop.value = el.scrollTop
    viewportHeight.value = el.clientHeight
  }

  const detach = () => {
    elRef.value?.removeEventListener?.('scroll', measure)
    observer?.disconnect()
    observer = null
  }

  watch(
    elRef,
    (el) => {
      detach()
      if (!el) return
      el.addEventListener('scroll', measure, { passive: true })
      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(measure)
        observer.observe(el)
      }
      measure()
    },
    { immediate: true, flush: 'post' }
  )
  onBeforeUnmount(detach)

  return computed(() =>
    rowWindow({
      total: count.value,
      rowHeight,
      scrollTop: scrollTop.value,
      viewportHeight: viewportHeight.value
    })
  )
}
