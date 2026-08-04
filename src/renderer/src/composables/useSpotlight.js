import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { blurPanels, holePath, placeCallout } from '../utils/spotlight'

const EMPTY = { x: 0, y: 0, w: 0, h: 0 }
const rectOf = (el) => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}
const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

// Everything the overlay needs for one target, measured against the window.
function spotlightFor(step, el, calloutH) {
  const box = rectOf(el)
  const stage = { w: window.innerWidth, h: window.innerHeight }
  return {
    box,
    panels: blurPanels({ box, stage }),
    clip: `path(evenodd, "${holePath({ box, stage })}")`,
    callout: placeCallout({ box, side: step.side ?? 'bottom', stage, calloutH, zone: !!step.zone })
  }
}

/** Escape leaves the tour, the same key that closes every dialog in the app. */
function useEscape(onEscape) {
  const onKey = (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    onEscape()
  }
  onMounted(() => window.addEventListener('keydown', onKey, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
}

/**
 * Keeps the overlay on its step's target. The geometry is pure
 * (utils/spotlight); this owns measuring and re-measuring, which must not sit
 * inline in an SFC.
 *
 * @param {{ step: import('vue').Ref, calloutEl: import('vue').Ref, onEscape: Function }} args
 */
export function useSpotlight({ step, calloutEl, onEscape }) {
  const box = ref({ ...EMPTY })
  const callout = ref({ x: 0, y: 0 })
  const panels = ref([])
  const clip = ref('')
  const found = ref(false)
  let raf = 0
  let watching = 0

  const targetEl = () => (step.value && document.querySelector(step.value.target)) || null

  function measure() {
    const el = targetEl()
    found.value = !!el
    if (!el) return
    // The callout's height is only known once it has rendered this step's text.
    const next = spotlightFor(step.value, el, calloutEl.value?.offsetHeight ?? 160)
    ;[box.value, panels.value, clip.value, callout.value] = [
      next.box,
      next.panels,
      next.clip,
      next.callout
    ]
  }

  // Two frames: one for the callout to render at its new size, one to measure
  // it. Measuring in the same frame reads the PREVIOUS step's height.
  function remeasure() {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      measure()
      raf = requestAnimationFrame(measure)
    })
  }

  // A resize or a step change is not the only way the target moves: a dialog
  // pane swaps under it, a list grows, the element goes away. Watching the rect
  // is what stops the ring marking a control that is no longer there.
  function follow() {
    const el = targetEl()
    if (!el !== !found.value || (el && !same(rectOf(el), box.value))) measure()
    watching = requestAnimationFrame(follow)
  }

  useEscape(onEscape)
  watch(step, remeasure, { immediate: true })
  onMounted(() => {
    remeasure()
    follow()
    window.addEventListener('resize', remeasure)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    cancelAnimationFrame(watching)
    window.removeEventListener('resize', remeasure)
  })

  return { box, callout, panels, clip, found, remeasure }
}
