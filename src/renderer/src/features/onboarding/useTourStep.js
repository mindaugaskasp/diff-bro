import { computed, onScopeDispose, ref, watch } from 'vue'
import { useDiffStore } from '../../stores/diffStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useOnboardingStore } from './onboardingStore'
import { isSampleFound } from './tourPlan'
import { isSampleOnScreen } from './tourSample'
import { watchDiagramsTour, watchSnippetsTour, watchTourTab } from './tourWatchers'

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

/** `{example}` and `{v2}` become the Diagrams tour's snippet ids. */
export const resolveSelector = (selector, examples) =>
  selector.replace(/\{(\w+)\}/g, (_, key) => examples?.[key] ?? '')

/**
 * Where the coach mark goes and what it rings. A step's `alt` wins while its
 * target is on screen: the Fill in dialog takes over from the Copy button.
 */
function placeStep(step, examples, measure) {
  const altRect = step.alt && measure(step.alt.target)
  if (altRect) return { step: { ...step, ...step.alt }, rect: altRect, rings: [] }
  const rect = measure(resolveSelector(step.target, examples))
  if (!rect) return null
  const own = step.ring === false ? [] : [{ rect, zone: !!step.zone }]
  const also = (step.also ?? [])
    .map((selector) => measure(resolveSelector(selector, examples)))
    .filter(Boolean)
    .map((box) => ({ rect: box, zone: false }))
  return { step, rect, rings: [...own, ...also] }
}

function useTargetRect(tour, step, measure) {
  const tabs = useTabsStore()
  const place = ref(null)
  const isOnItsTab = () => !step.value?.onTab || tabs.activeId === tour.tourTabId
  function remeasure() {
    place.value = step.value && isOnItsTab() ? placeStep(step.value, tour.examples, measure) : null
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
      else place.value = null
    },
    { immediate: true }
  )
  onScopeDispose(() => cancelAnimationFrame(frame))
  return { place, remeasure }
}

/**
 * Drives the running tour: each step advances on its own event, closing the
 * tab a step needs ends it as skipped, and the coach mark follows its target
 * and hides while it is off screen. Escape is deliberately not handled.
 * @param {{ measure?: (selector: string) => import('../../types').ScreenRect|null }} [opts]
 */
export function useTourStep({ measure = measureTarget } = {}) {
  const tour = useOnboardingStore()
  tour.init()
  watchSample(tour)
  watchSearch(tour)
  watchSnippetsTour(tour)
  watchDiagramsTour(tour)
  watchTourTab(tour)
  const current = computed(() => (tour.step && !tour.step.inline ? tour.step : null))
  const { place, remeasure } = useTargetRect(tour, current, measure)
  const step = computed(() => place.value?.step ?? current.value)
  const rect = computed(() => place.value?.rect ?? null)
  const rings = computed(() => place.value?.rings ?? [])
  const visible = computed(() => !!step.value && !!rect.value)
  return { step, rect, rings, visible, remeasure }
}
