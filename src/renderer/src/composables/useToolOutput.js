import { onBeforeUnmount, onMounted, shallowRef } from 'vue'

// What the open tool panel currently holds that is worth keeping. The panels
// have no common output shape, so each OFFERS its own and the dialog's actions
// row reads it — the same arrangement useCaptureRegion uses for the image
// export. Read lazily, so the offer follows the panel's state rather than a
// snapshot of it. Reactive, because the panel registers on ITS mount — after the
// dialog around it has already rendered — and the actions row has to notice.
const offer = shallowRef(null)

/**
 * Offer this panel's output for as long as it is mounted. Taking it back on
 * unmount is the point: a stale offer would let the next tool save the previous
 * one's output.
 * @param {() => string} read
 * @param {() => string} language
 */
export function offerToolOutput(read, language) {
  onMounted(() => (offer.value = { read, language }))
  onBeforeUnmount(() => (offer.value = null))
}

/** @returns {{ text: string, language: string } | null} */
export function toolOutput() {
  const held = offer.value
  const text = held ? String(held.read() ?? '') : ''
  return text.trim() ? { text, language: held.language() } : null
}

// Test seam: no panel is mounted between tests to drop it.
export function clearToolOutput() {
  offer.value = null
}
