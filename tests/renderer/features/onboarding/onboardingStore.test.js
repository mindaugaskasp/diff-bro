// The tour's schedule and its exits. Every path a user can take OUT of the
// tour matters as much as the happy one: a tour that cannot be refused, or that
// re-opens after being refused, is worse than no tour.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOnboardingStore } from '../../../../src/renderer/src/features/onboarding'
import { useDiffStore } from '../../../../src/renderer/src/stores/diffStore'
import { useSettingsStore } from '../../../../src/renderer/src/stores/settingsStore'
import { useSnippetStore } from '../../../../src/renderer/src/stores/snippetStore'
import { useTabsStore } from '../../../../src/renderer/src/stores/tabsStore'
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

const DEMO_NAME = 'Checkout API — staging'
const DEMO = [
  { path: null, name: 'demo-config-v1.json', content: '{"replicas":2}' },
  { path: null, name: 'demo-config-v2.json', content: '{"replicas":3}' }
]

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    appVersion: TOUR_VERSION,
    demoFiles: async () => DEMO,
    vaultEncrypt: async (plaintext) => ({ iv: 'iv', data: plaintext })
  }
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
    for (let i = 0; i < TOUR_STEPS.length - RUN_ONE; i++) {
      tour.next()
      if (tour.revealing) vi.runAllTimers()
    }
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

// The inversion. A step's command used to fire when the step was ENTERED, so
// the window opened and the callout then explained what had just happened to
// you. Now the step points at the control and Next performs the action.
describe("when a step's command fires", () => {
  it('runs nothing on arrival, however much the step has to say', () => {
    const tour = useOnboardingStore()
    tour.begin()
    expect(tour.currentStep.advance).toBe('tour-demo-diff')
    expect(tour.pendingCommand).toBe(null)
  })

  it("runs the step's own command when Next is pressed", () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.next()
    expect(tour.pendingCommand).toStrictEqual({ action: 'tour-demo-diff' })
  })

  // A watcher on a bare action name would see no change the second time and
  // silently drop it, which a replay hits immediately.
  it('hands over a fresh request each time, so the same command twice both run', () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.next()
    const first = tour.pendingCommand
    tour.replay()
    tour.next()
    expect(tour.pendingCommand).toStrictEqual(first)
    expect(tour.pendingCommand).not.toBe(first)
  })

  // The one effect that belongs on arrival: the library step types into the
  // search so the list is seen narrowing while the card explains it. Nothing
  // opens — it happens inside the ring.
  it('runs an entry effect as its step arrives', () => {
    const tour = useOnboardingStore()
    tour.replay()
    const library = TOUR_STEPS.findIndex((s) => s.id === 'library')
    for (let i = 0; i < library; i++) {
      tour.next()
      if (tour.revealing) vi.runAllTimers()
    }
    expect(tour.currentStep.id).toBe('library')
    expect(tour.pendingCommand).toStrictEqual({ action: 'tour-demo-search' })
  })
})

// Revisiting a step has to put the world back too, or the step it returns to
// points at a control the last step's window is now covering.
describe('going back', () => {
  it('returns to the step before, and records the move', () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.next()
    vi.runAllTimers()
    expect(tour.currentStep.id).toBe('share')

    tour.back()
    expect(tour.currentStep.id).toBe('compare')
    expect(tour.tourStep).toBe(0)
    expect(stored().tourStep).toBe(0)
  })

  it('does nothing on the first step — there is nowhere behind it', () => {
    const tour = useOnboardingStore()
    tour.begin()
    tour.back()
    expect(tour.index).toBe(0)
    expect(tour.tourStep).toBe(0)
  })

  it('undoes what the step it returns to had opened', () => {
    const ui = useUiStore()
    const tour = useOnboardingStore()
    tour.replay()
    const at = TOUR_STEPS.findIndex((s) => s.id === 'settings-panes')
    for (let i = 0; i < at; i++) {
      tour.next()
      if (tour.revealing) vi.runAllTimers()
    }
    ui.showSettingsDialog = true

    tour.back()
    expect(tour.currentStep.id).toBe('settings-open')
    expect(tour.pendingCommand).toStrictEqual({ action: 'tour-close-settings' })
  })

  // Leaving forwards already cleared the search it typed; leaving backwards has
  // to as well, or step two is read over a sidebar filtered by a word the user
  // never typed.
  it('undoes an entry effect on the way back OFF its step', () => {
    const tour = useOnboardingStore()
    tour.replay()
    const at = TOUR_STEPS.findIndex((s) => s.id === 'library')
    for (let i = 0; i < at; i++) {
      tour.next()
      if (tour.revealing) vi.runAllTimers()
    }
    expect(tour.currentStep.id).toBe('library')

    tour.back()
    expect(tour.currentStep.id).toBe('share')
    expect(tour.pendingCommand).toStrictEqual({ action: 'tour-clear-search' })
  })

  it('re-runs an entry effect on the way back into its step', () => {
    const tour = useOnboardingStore()
    tour.replay()
    const at = TOUR_STEPS.findIndex((s) => s.id === 'library')
    for (let i = 0; i <= at; i++) {
      tour.next()
      if (tour.revealing) vi.runAllTimers()
    }
    tour.back()
    expect(tour.currentStep.id).toBe('library')
    expect(tour.pendingCommand).toStrictEqual({ action: 'tour-demo-search' })
  })
})

// The demo pair belongs to the tour. Left behind it became the user's only tab,
// marked unsaved, restored on the next launch, and prompting about work they
// never did.
describe('the demo comparison', () => {
  const opened = async () => {
    const tabs = useTabsStore()
    tabs.init()
    const tour = useOnboardingStore()
    tour.begin()
    await tour.openDemo()
    return { tabs, tour, diff: useDiffStore() }
  }

  it('opens in a scratch tab of its own, never in the one the user has', async () => {
    const { tabs, diff } = await opened()
    expect(tabs.tabs).toHaveLength(2)
    expect(diff.left.name).toBe('demo-config-v1.json')
    expect(diff.right.name).toBe('demo-config-v2.json')
  })

  it('goes when the tour is skipped', async () => {
    const { tabs, tour, diff } = await opened()
    tour.skip()
    expect(tabs.tabs).toHaveLength(1)
    expect(diff.left).toBe(null)
    expect(tour.demoTabId).toBe(null)
  })

  it('goes when the run finishes', async () => {
    const { tabs, tour } = await opened()
    runOut(tour)
    expect(tabs.tabs).toHaveLength(1)
  })

  it('opens once, however many times the step is re-entered', async () => {
    const { tabs, tour } = await opened()
    await tour.openDemo()
    expect(tabs.tabs).toHaveLength(2)
  })
})

// The rest of the stage, cleared the same way. Run one walks THROUGH Settings,
// so without this the "Three more tips?" dialog opened on top of it.
describe('putting the stage back', () => {
  it('closes the Settings dialog the tour opened', () => {
    const ui = useUiStore()
    const tour = useOnboardingStore()
    tour.begin()
    ui.showSettingsDialog = true
    runOut(tour)
    expect(ui.showSettingsDialog).toBe(false)
  })

  it('clears the search it typed into the sidebar', () => {
    const ui = useUiStore()
    const tour = useOnboardingStore()
    tour.begin()
    tour.typeSearch()
    vi.runAllTimers()
    expect(ui.sidebarQuery).toBeTruthy()
    tour.skip()
    expect(ui.sidebarQuery).toBe('')
  })

  // A tag filter of the user's hid the very snippet the last step points at,
  // which left the ring on the whole section talking about a row not in it.
  it('clears a filter that would hide what a step points at, then hands it back', () => {
    const ui = useUiStore()
    ui.sidebarTags = ['config']
    ui.sidebarQuery = 'flags'
    const tour = useOnboardingStore()
    tour.begin()

    tour.clearFilters()
    expect(ui.sidebarTags).toStrictEqual([])
    expect(ui.sidebarQuery).toBe('')

    tour.skip()
    expect(ui.sidebarTags).toStrictEqual(['config'])
    expect(ui.sidebarQuery).toBe('flags')
  })

  // The step asks the user to press a GLOBAL shortcut that main ignores while
  // this window is in front. Lifted for the step, put back when it is left —
  // otherwise the guard that keeps it off the Settings capture field is gone.
  it('puts the shortcut guard back when the tour ends', () => {
    const allowed = []
    window.api.quickLookAllowWhileFocused = (on) => allowed.push(on)
    const tour = useOnboardingStore()
    tour.begin()
    tour.armChord()
    expect(allowed).toStrictEqual([true])

    tour.skip()
    expect(allowed.at(-1)).toBe(false)
  })

  it('gives the sidebar back to whoever had collapsed it', () => {
    const settings = useSettingsStore()
    settings.setSidebarCollapsed(true)
    const tour = useOnboardingStore()
    tour.begin()
    expect(settings.sidebarCollapsed).toBe(false)
    tour.skip()
    expect(settings.sidebarCollapsed).toBe(true)
  })

  it('leaves an editor the tour never opened alone', () => {
    const snippets = useSnippetStore()
    snippets.editingSnippet = { id: null }
    const tour = useOnboardingStore()
    tour.begin()
    tour.openSnippet()
    tour.skip()
    expect(snippets.editingSnippet).toStrictEqual({ id: null })
  })

  // Only the ringed Save creates it — the card's own button moves on and does
  // NOT save, since two controls doing one thing teaches neither. Which means
  // the tour never learns the id, and cleanup goes by what was there BEFORE.
  const pressSave = async (snippets) => {
    await snippets.add({ name: DEMO_NAME, content: '{}', language: 'json' })
    snippets.editingSnippet = null
  }

  it('deletes the example the user saved when the run finishes', async () => {
    const snippets = useSnippetStore()
    const tour = useOnboardingStore()
    tour.begin()
    tour.openSnippet()
    await pressSave(snippets)
    expect(snippets.entries).toHaveLength(1)

    runOut(tour)
    expect(snippets.entries).toStrictEqual([])
  })

  it('deletes it just the same when the tour is walked out of', async () => {
    const snippets = useSnippetStore()
    const tour = useOnboardingStore()
    tour.begin()
    tour.openSnippet()
    await pressSave(snippets)
    tour.skip()
    expect(snippets.entries).toStrictEqual([])
  })

  it('spares a snippet of the same name the user already had', async () => {
    const snippets = useSnippetStore()
    await snippets.add({ name: DEMO_NAME, content: 'mine', language: 'json' })
    const tour = useOnboardingStore()
    tour.begin()
    tour.openSnippet()
    await pressSave(snippets)
    tour.skip()
    expect(snippets.entries).toHaveLength(1)
  })

  it('closes the editor it filled in itself', () => {
    const snippets = useSnippetStore()
    const tour = useOnboardingStore()
    tour.begin()
    tour.openSnippet()
    expect(snippets.editingSnippet.initialName).toBeTruthy()
    tour.skip()
    expect(snippets.editingSnippet).toBe(null)
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
