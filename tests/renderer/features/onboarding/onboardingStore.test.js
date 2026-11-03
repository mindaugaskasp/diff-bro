import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOnboardingStore } from '../../../../src/renderer/src/features/onboarding'
import { useDiffStore } from '../../../../src/renderer/src/stores/diffStore'
import { useTabsStore } from '../../../../src/renderer/src/stores/tabsStore'
import { useUiStore } from '../../../../src/renderer/src/stores/uiStore'

const SAMPLE = [
  { name: 'config-v1.json', path: null, content: '{"replicas":2}' },
  { name: 'config-v2.json', path: null, content: '{"replicas":3}' }
]
const stored = () => JSON.parse(localStorage.getItem('diffbro.onboarding') ?? 'null')

function setup(onboarding) {
  setActivePinia(createPinia())
  localStorage.clear()
  if (onboarding !== undefined) {
    localStorage.setItem('diffbro.onboarding', JSON.stringify(onboarding))
  }
  window.api = {
    demoFiles: async () => SAMPLE.map((f) => ({ ...f })),
    vaultEncrypt: async (plaintext) => ({ iv: 'iv', data: plaintext })
  }
  useTabsStore().init()
  return useOnboardingStore()
}

beforeEach(() => setup())

describe('the offer', () => {
  it('is open on a fresh install, before anything runs', () => {
    const tour = setup()
    expect(tour.isOffering).toBe(true)
    expect(tour.isRunning).toBe(false)
  })

  it('stays shut for a profile from an older version', () => {
    expect(setup({ showTips: true, tourStep: 2 }).isOffering).toBe(false)
  })

  it('rewrites an old onboarding file in the new shape on init', () => {
    setup({ showTips: false, tourStep: 2, seenVersion: '0.5.0' }).init()
    expect(stored()).toEqual({ schema: 2, showTips: false, tours: {}, offer: false })
  })

  it('records a fresh install’s offer on init, so a relaunch keeps it', () => {
    setup().init()
    expect(stored()).toMatchObject({ schema: 2, offer: true })
  })

  it('goes for good once skipped', () => {
    const tour = setup()
    tour.skip()
    expect(tour.isOffering).toBe(false)
    expect(stored()).toMatchObject({ offer: false, tours: { core: 'skipped' } })
  })

  it('goes once the user compares two files of their own', () => {
    const tour = setup()
    tour.noteOwnComparison()
    expect(tour.isOffering).toBe(false)
    expect(stored()).toMatchObject({ offer: false, tours: {} })
  })
})

describe('running the core tour', () => {
  it('loads the sample pair into the start tab and moves to Save', async () => {
    const tour = setup()
    await tour.loadSample()
    const diff = useDiffStore()
    const tabs = useTabsStore()
    expect([diff.left.name, diff.right.name]).toEqual(['config-v1.json', 'config-v2.json'])
    expect(diff.left.path).toBeNull()
    expect([diff.leftFormatHint, diff.rightFormatHint]).toEqual([null, null])
    expect(tabs.active.sample).toBe(true)
    expect(tour.sample.tabId).toBe(tabs.activeId)
    expect(tour.step.id).toBe('save')
    expect(tour.stepNumber).toBe(2)
    expect(tour.stepCount).toBe(3)
  })

  it('opens a fresh tab for the sample when the current one holds work', async () => {
    const tour = setup()
    const tabs = useTabsStore()
    await useDiffStore().dropFiles([
      { name: 'a.txt', path: null, content: 'a' },
      { name: 'b.txt', path: null, content: 'b' }
    ])
    const own = tabs.activeId
    tour.start('core')
    await tour.loadSample()
    expect(tabs.activeId).not.toBe(own)
    expect(tabs.tabs.find((t) => t.id === own).sample).toBeFalsy()
  })

  it('does nothing when no sample pair comes back', async () => {
    const tour = setup()
    window.api.demoFiles = async () => []
    await tour.loadSample()
    expect(tour.step.id).toBe('drop')
    expect(useDiffStore().left).toBeNull()
  })

  it('advances only on the event its step waits for', async () => {
    const tour = setup()
    await tour.loadSample()
    tour.advance('sample-found')
    expect(tour.step.id).toBe('save')
    tour.noteSampleSaved('entry-1')
    expect(tour.step.id).toBe('find')
    expect(tour.sampleEntryId).toBe('entry-1')
  })

  it('finishes on the last step, shows the done card and closes the offer', async () => {
    const tour = setup()
    await tour.loadSample()
    tour.noteSampleSaved('entry-1')
    tour.advance('sample-found')
    expect(tour.isRunning).toBe(false)
    expect(tour.doneCard).toBe('core')
    expect(stored()).toMatchObject({ offer: false, tours: { core: 'done' } })
    tour.dismissDone()
    expect(tour.doneCard).toBeNull()
  })

  it('Skip ends a running tour and records it', async () => {
    const tour = setup()
    await tour.loadSample()
    tour.skip()
    expect(tour.isRunning).toBe(false)
    expect(stored()).toMatchObject({ tours: { core: 'skipped' } })
  })

  it('a comparison of one’s own on step one ends it quietly', () => {
    const tour = setup()
    tour.start('core')
    tour.noteOwnComparison()
    expect(tour.isRunning).toBe(false)
  })

  it('a comparison of one’s own in another tab leaves a later step running', async () => {
    const tour = setup()
    await tour.loadSample()
    tour.noteOwnComparison()
    expect(tour.step.id).toBe('save')
  })
})

describe('the tours after the core one', () => {
  async function finishedCore() {
    const tour = setup()
    await tour.loadSample()
    tour.noteSampleSaved('entry-1')
    tour.advance('sample-found')
    return tour
  }

  it('a chip on the core done card starts the Snippets tour and closes the card', async () => {
    const tour = await finishedCore()
    await tour.startTour('snippets')
    expect(tour.doneCard).toBeNull()
    expect(tour.running).toMatchObject({ id: 'snippets', index: 0 })
    expect(tour.isOffering).toBe(false)
  })

  it('a chip starts the Diagrams tour', async () => {
    const tour = await finishedCore()
    await tour.startTour('diagrams')
    expect(tour.running?.id).toBe('diagrams')
  })

  it('a comparison of one’s own does not end a Snippets tour', async () => {
    const tour = await finishedCore()
    await tour.startTour('snippets')
    tour.noteOwnComparison()
    expect(tour.running?.id).toBe('snippets')
  })

  it('records the outcome under the tour that ran', async () => {
    const tour = await finishedCore()
    await tour.startTour('snippets')
    tour.skip()
    expect(stored().tours).toEqual({ core: 'done', snippets: 'skipped' })
  })
})

describe('replaying', () => {
  it('closes Settings, shows the start screen and starts at the offer', async () => {
    const tour = setup({ schema: 2, showTips: true, tours: { core: 'done' }, offer: false })
    const ui = useUiStore()
    ui.showSettingsDialog = true
    await useDiffStore().dropFiles([
      { name: 'a.txt', path: null, content: 'a' },
      { name: 'b.txt', path: null, content: 'b' }
    ])
    tour.replay()
    expect(ui.showSettingsDialog).toBe(false)
    expect(useDiffStore().left).toBeNull()
    expect(tour.isOffering).toBe(true)
    expect(tour.step.id).toBe('drop')
  })

  it('keeps a finished tour finished when the replay is skipped', () => {
    const tour = setup({ schema: 2, tours: { core: 'done' }, offer: false })
    tour.replay()
    tour.skip()
    expect(stored().tours).toEqual({ core: 'done' })
  })

  it('setShowTips writes the switch', () => {
    const tour = setup()
    tour.setShowTips(false)
    expect(stored().showTips).toBe(false)
  })
})
