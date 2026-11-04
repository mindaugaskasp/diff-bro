import { computed, onScopeDispose, ref, watch, watchEffect } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import { useOnboardingStore } from './onboardingStore'
import { isTipQuiet } from './tipSchedule'

const INSET = 16

function followPaneTop(visible) {
  const top = ref(INSET)
  let frame = 0
  const follow = () => {
    const pane = document.querySelector('[data-tour="pane"]')
    top.value = Math.round((pane?.getBoundingClientRect().top ?? 0) + INSET)
    frame = requestAnimationFrame(follow)
  }
  watch(
    visible,
    (on) => {
      cancelAnimationFrame(frame)
      if (on) follow()
    },
    { immediate: true }
  )
  onScopeDispose(() => cancelAnimationFrame(frame))
  return top
}

function watchFront(tour) {
  const front = () => tour.noteFront(tour.today())
  const onVisible = () => document.visibilityState === 'visible' && front()
  window.addEventListener('focus', front)
  document.addEventListener('visibilitychange', onVisible)
  onScopeDispose(() => {
    window.removeEventListener('focus', front)
    document.removeEventListener('visibilitychange', onVisible)
  })
  if (document.hasFocus()) front()
}

/** The daily tip: due the first time the window comes to the front on a new date, shown once quiet. */
export function useDailyTip() {
  const tour = useOnboardingStore()
  const ui = useUiStore()
  watchFront(tour)

  watchEffect(() => {
    if (!tour.tipDue) return
    const quiet = isTipQuiet({
      running: tour.isRunning,
      doneCard: !!tour.doneCard,
      releaseCard: !!tour.releaseCard || tour.pendingReleases.length > 0,
      dialogOpen: ui.hasOpenDialog,
      offering: tour.isOffering,
      firstDay: tour.tips.since === tour.tipDue
    })
    if (quiet) tour.presentTip()
  })

  const tip = computed(() => tour.tipOf(tour.tipCard))
  const visible = computed(() => !!tip.value && !tour.isRunning && !ui.hasOpenDialog)
  return { tip, visible, top: followPaneTop(visible) }
}
