// The tour's schedule and its exits. Every path a user can take OUT of the
// tour matters as much as the happy one: a tour that cannot be refused, or that
// re-opens after being refused, is worse than no tour.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOnboardingStore } from '../../../../src/renderer/src/features/onboarding'
import { useUiStore } from '../../../../src/renderer/src/stores/uiStore'
import { TOUR_STEPS, TOUR_VERSION } from '../../../../src/renderer/src/utils/tourSteps'

const RUN_ONE = TOUR_STEPS.filter((s) => s.run === 1).length
const stored = () => JSON.parse(localStorage.getItem('diffbro.onboarding') ?? '{}')

// Step one holds the veil down for a beat before advancing, so walking the run
// means flushing that timer each time.
const runOut = (tour) => {
  for (let i = 0; i < RUN_ONE; i++) {
    tour.next()
    if (tour.revealing) vi.runAllTimers()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = { appVersion: TOUR_VERSION }
})
afterEach(() => vi.useRealTimers())

describe('starting', () => {
  it('opens run one on a cold first launch', () => {
    const tour = useOnboardingStore()
    tour.begin()
    expect(tour.active).toBe(true)
    expect(tour.steps).toHaveLength(RUN_ONE)
    expect(tour.currentStep.id).toBe('compare')
  })

  it('stays shut when tips are off', () => {
    const tour = useOnboardingStore()
    tour.setShowTips(false)
    tour.begin()
    expect(tour.active).toBe(false)
    expect(tour.promptOpen).toBe(false)
  })

  it('resumes mid-run where it was left', () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.next()
    vi.runAllTimers()
    expect(tour.tourStep).toBe(1)

    setActivePinia(createPinia())
    const relaunched = useOnboardingStore()
    relaunched.begin()
    expect(relaunched.currentStep.id).toBe(TOUR_STEPS[1].id)
  })
})

describe('advancing', () => {
  it('walks the run and then closes', () => {
    const tour = useOnboardingStore()
    tour.begin()
    runOut(tour)
    expect(tour.active).toBe(false)
    expect(tour.tourStep).toBe(RUN_ONE)
  })

  it('asks about run two the moment run one ends, not on a later launch', () => {
    const tour = useOnboardingStore()
    tour.begin()
    runOut(tour)
    expect(tour.promptOpen).toBe(true)
  })

  it('marks the version seen once every run is done', () => {
    const tour = useOnboardingStore()
    tour.begin()
    runOut(tour)
    tour.acceptPrompt()
    for (let i = 0; i < TOUR_STEPS.length - RUN_ONE; i++) tour.next()
    expect(tour.tourStep).toBe(TOUR_STEPS.length)
    expect(tour.seenVersion).toBe(TOUR_VERSION)
    expect(tour.promptOpen).toBe(false)
  })
})

describe('the continuation prompt', () => {
  const toPrompt = () => {
    const tour = useOnboardingStore()
    tour.begin()
    runOut(tour)
    return tour
  }

  it('Show me starts run two in the same session', () => {
    const tour = toPrompt()
    tour.acceptPrompt()
    expect(tour.promptOpen).toBe(false)
    expect(tour.active).toBe(true)
    expect(tour.steps.every((s) => s.run === 2)).toBe(true)
  })

  it('Not now closes it without turning tips off', () => {
    const tour = toPrompt()
    tour.deferPrompt()
    expect(tour.promptOpen).toBe(false)
    expect(tour.active).toBe(false)
    expect(tour.showTips).toBe(true)
  })

  it('re-asks exactly once on the next launch, then never again', () => {
    toPrompt().deferPrompt()

    setActivePinia(createPinia())
    const second = useOnboardingStore()
    second.begin()
    expect(second.promptOpen).toBe(true)
    second.deferPrompt()

    setActivePinia(createPinia())
    const third = useOnboardingStore()
    third.begin()
    expect(third.promptOpen).toBe(false)
    expect(third.active).toBe(false)
  })

  it('does not nag again in the same session', () => {
    const tour = toPrompt()
    tour.deferPrompt()
    tour.begin()
    expect(tour.promptOpen).toBe(false)
  })
})

describe('opting out', () => {
  it('skip closes the tour and turns tips off for good', () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.skip()
    expect(tour.active).toBe(false)
    expect(tour.showTips).toBe(false)
    expect(stored().showTips).toBe(false)
  })

  it('a skipped run one never leads to the run-two prompt', () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.skip()

    setActivePinia(createPinia())
    const relaunched = useOnboardingStore()
    relaunched.begin()
    expect(relaunched.promptOpen).toBe(false)
    expect(relaunched.active).toBe(false)
  })

  it('ignores a skip when no tour is running — Escape closes dialogs all day', () => {
    const tour = useOnboardingStore()
    expect(tour.active).toBe(false)
    tour.skip()
    expect(tour.showTips).toBe(true)
    expect(localStorage.getItem('diffbro.onboarding')).toBeNull()
  })

  it('can be skipped from the very first step', () => {
    const tour = useOnboardingStore()
    tour.begin()
    expect(tour.currentStep.id).toBe('compare')
    tour.skip()
    expect(tour.active).toBe(false)
  })
})

describe('replay', () => {
  it('runs everything from the start', () => {
    const tour = useOnboardingStore()
    tour.replay()
    expect(tour.active).toBe(true)
    expect(tour.steps).toHaveLength(TOUR_STEPS.length)
    expect(tour.currentStep.id).toBe(TOUR_STEPS[0].id)
  })

  it('works after opting out — and does NOT switch tips back on', () => {
    const tour = useOnboardingStore()
    tour.setShowTips(false)
    tour.replay()
    expect(tour.active).toBe(true)
    expect(tour.showTips).toBe(false)
  })

  it('gets the Settings dialog out of the way — step one sits behind it', () => {
    const ui = useUiStore()
    ui.showSettingsDialog = true
    useOnboardingStore().replay()
    expect(ui.showSettingsDialog).toBe(false)
  })

  it('leaves the recorded progress alone until it finishes', () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.next()
    vi.runAllTimers()
    const before = tour.tourStep
    tour.replay()
    // Stepping is what advances progress, so the guard is only observable
    // after a next(): asserting straight after replay() proved nothing.
    tour.next()
    expect(tour.tourStep).toBe(before)
  })
})

describe('persistence', () => {
  it('round-trips its state through the store file', () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.next()
    vi.runAllTimers()
    expect(stored().tourStep).toBe(1)
    expect(stored().showTips).toBe(true)
  })

  it('falls back to sane defaults on a garbage payload', () => {
    localStorage.setItem('diffbro.onboarding', '{ not json')
    const tour = useOnboardingStore()
    expect(tour.showTips).toBe(true)
    expect(tour.tourStep).toBe(0)
    expect(tour.deferred).toBe(0)
  })

  it('clamps a hand-edited step index instead of pointing at nothing', () => {
    localStorage.setItem(
      'diffbro.onboarding',
      JSON.stringify({ tourStep: 999, showTips: true, deferred: -4 })
    )
    const tour = useOnboardingStore()
    expect(tour.tourStep).toBeLessThanOrEqual(TOUR_STEPS.length)
    expect(tour.deferred).toBe(0)
  })
})

describe('the reveal after step one', () => {
  it('drops the veil for a beat before moving on, then advances', () => {
    const tour = useOnboardingStore()
    tour.begin()
    expect(tour.currentStep.id).toBe('compare')

    tour.next()
    // Still on step one, but unveiled: the comparison it loaded is on screen.
    expect(tour.revealing).toBe(true)
    expect(tour.currentStep.id).toBe('compare')

    vi.runAllTimers()
    expect(tour.revealing).toBe(false)
    expect(tour.currentStep.id).toBe(TOUR_STEPS[1].id)
  })

  it('ignores a second Next while the veil is down', () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.next()
    tour.next()
    vi.runAllTimers()
    expect(tour.currentStep.id).toBe(TOUR_STEPS[1].id)
  })

  it('a skip during the reveal ends the tour rather than advancing into it', () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.next()
    tour.skip()
    vi.runAllTimers()
    expect(tour.active).toBe(false)
    expect(tour.revealing).toBe(false)
  })
})
