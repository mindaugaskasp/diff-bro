import { computed, onScopeDispose, ref, watch } from 'vue'
import { useSnippetStore } from '../../stores/snippetStore'
import { useOnboardingStore } from './onboardingStore'
import { measureTarget } from './useTourStep'

function followTarget(selector, measure) {
  const rect = ref(null)
  let frame = 0
  const follow = () => {
    rect.value = measure(selector.value)
    frame = requestAnimationFrame(follow)
  }
  watch(
    selector,
    (current) => {
      cancelAnimationFrame(frame)
      if (current) follow()
      else rect.value = null
    },
    { immediate: true }
  )
  onScopeDispose(() => cancelAnimationFrame(frame))
  return rect
}

function dismissOnAnyPress(shown, end) {
  const press = () => end()
  watch(shown, (tip) => {
    if (tip) window.addEventListener('pointerdown', press, true)
    else window.removeEventListener('pointerdown', press, true)
  })
  onScopeDispose(() => window.removeEventListener('pointerdown', press, true))
}

/**
 * A tip's Show me: offered while its control can be shown, then rings it until
 * the next press anywhere.
 * @param {{ measure?: (selector: string) => import('../../types').ScreenRect|null }} [opts]
 */
export function useTipShowMe({ measure = measureTarget } = {}) {
  const tour = useOnboardingStore()
  const snippets = useSnippetStore()
  const cardTip = computed(() => tour.tipOf(tour.tipCard))
  const shown = computed(() => tour.tipOf(tour.tipShowMe))
  const selector = computed(() => (shown.value ?? cardTip.value)?.show?.target ?? null)
  const rect = followTarget(selector, measure)
  dismissOnAnyPress(shown, () => tour.endShowMe())

  const canShow = computed(() => {
    const show = cardTip.value?.show
    if (!show) return false
    if (show.prepare === 'search') return true
    if (show.prepare === 'snippets') return snippets.entries.length > 0
    return !!rect.value
  })
  return { tip: shown, rect, canShow, visible: computed(() => !!shown.value && !!rect.value) }
}
