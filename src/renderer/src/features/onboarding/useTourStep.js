import { computed, onScopeDispose, ref, watch } from 'vue'
import { useDiffStore } from '../../stores/diffStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useOnboardingStore } from './onboardingStore'
import { isSampleFound } from './tourPlan'
import { isSampleOnScreen } from './tourSample'

const isOnScreen = (r) =>
  r.width > 0 &&
  r.height > 0 &&
  r.bottom > 0 &&
  r.right > 0 &&
  r.top < innerHeight &&
  r.left < innerWidth

/**
 * The target's box, or null when it is missing, off screen or covered (a
 * dialog over it answers the hit test instead).
 * @param {string} selector
 * @returns {import('../../types').ScreenRect|null}
 */
export function measureTarget(selector) {
  const el = document.querySelector(selector)
  const r = el?.getBoundingClientRect()
  if (!r || !isOnScreen(r)) return null
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  if (!hit || !el.contains(hit)) return null
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

function watchSample(tour) {
  const tabs = useTabsStore()
  const diff = useDiffStore()
  const sampleTab = () => tabs.tabs.find((t) => t.id === tour.sample?.tabId && t.sample) ?? null

  watch(
    () => tour.isRunning && sampleTab()?.entryId,
    (id) => id && tour.noteSampleSaved(id)
  )
  watch(
    () => tour.isRunning && !!tour.sample && !sampleTab(),
    (gone) => gone && tour.stepNumber < tour.stepCount && tour.skip()
  )
  watch(
    () => [diff.left, diff.right],
    () => {
      const tab = tabs.active
      if (tab?.sample && tour.sample && !isSampleOnScreen(diff, tour.sample.files))
        tab.sample = false
      if (diff.left && diff.right && !tabs.active?.sample) tour.noteOwnComparison()
    }
  )
}

function watchSearch(tour) {
  const ui = useUiStore()
  const settings = useSettingsStore()
  const vault = useVaultStore()
  watch(
    () =>
      isSampleFound({
        query: ui.sidebarQuery,
        panel: settings.sidebarPanel,
        name: vault.entries.find((e) => e.id === tour.sampleEntryId)?.name ?? ''
      }),
    (found) => found && tour.advance('sample-found')
  )
}

function useTargetRect(tour, step, measure) {
  const tabs = useTabsStore()
  const rect = ref(null)
  const isOnItsTab = () => !step.value?.onSample || tabs.activeId === tour.sample?.tabId
  function remeasure() {
    rect.value = step.value && isOnItsTab() ? measure(step.value.target) : null
  }
  let frame = 0
  const follow = () => {
    remeasure()
    frame = requestAnimationFrame(follow)
  }
  watch(
    step,
    (current) => {
      cancelAnimationFrame(frame)
      if (current) follow()
      else rect.value = null
    },
    { immediate: true }
  )
  onScopeDispose(() => cancelAnimationFrame(frame))
  return { rect, remeasure }
}

/**
 * Drives the running tour: each step advances on its own event, the sample
 * tab closing early ends it as skipped, and the coach mark follows its target
 * and hides while it is off screen. Escape is deliberately not handled.
 * @param {{ measure?: (selector: string) => import('../../types').ScreenRect|null }} [opts]
 */
export function useTourStep({ measure = measureTarget } = {}) {
  const tour = useOnboardingStore()
  tour.init()
  watchSample(tour)
  watchSearch(tour)
  const step = computed(() => (tour.step && !tour.step.inline ? tour.step : null))
  const { rect, remeasure } = useTargetRect(tour, step, measure)
  const visible = computed(() => !!step.value && !!rect.value)
  return { step, rect, visible, remeasure }
}
