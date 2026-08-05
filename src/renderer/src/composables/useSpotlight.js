import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { spotlightFor } from '../utils/spotlight'

const rectOf = (el) => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}
const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
const stage = () => ({ w: window.innerWidth, h: window.innerHeight })
const find = (selector) => (selector && document.querySelector(selector)) || null
const rectFor = (selector) => {
  const el = find(selector)
  return el ? rectOf(el) : null
}
// A control scrolled out of its panel gets an unanchored card that reads as
// being about something off screen. `nearest` never yanks one already in view.
const reveal = (step) =>
  (find(step?.point) ?? find(step?.target))?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest'
  })
// A template ref on a COMPONENT holds the instance, whose offsetHeight is
// undefined — read the root node or every placement silently uses the fallback.
const FALLBACK_H = 160
const heightOf = (ref) => (ref?.$el ?? ref)?.offsetHeight || FALLBACK_H

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
 * @returns {import('vue').Ref} everything the overlay draws, remeasured in place
 */
export function useSpotlight({ step, calloutEl, onEscape }) {
  const spot = ref(spotlightFor({ box: null, stage: stage(), calloutH: FALLBACK_H }))
  let raf = 0
  let watching = 0

  const targetEl = () => find(step.value?.target)

  function measure() {
    spot.value = spotlightFor({
      box: rectFor(step.value?.target),
      context: rectFor(step.value?.context),
      point: rectFor(step.value?.point),
      side: step.value?.side,
      zone: !!step.value?.zone,
      stage: stage(),
      calloutH: heightOf(calloutEl.value)
    })
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
    if (!!el !== spot.value.found || (el && !same(rectOf(el), spot.value.box))) measure()
    watching = requestAnimationFrame(follow)
  }

  useEscape(onEscape)
  // Only while a step is on screen: ungated, the rect watcher spun a frame
  // callback for the app's whole lifetime to serve a tour that plays once.
  watch(
    step,
    (current) => {
      cancelAnimationFrame(watching)
      reveal(current)
      remeasure()
      if (current) follow()
    },
    { immediate: true }
  )
  onMounted(() => window.addEventListener('resize', remeasure))
  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    cancelAnimationFrame(watching)
    window.removeEventListener('resize', remeasure)
  })

  return spot
}
