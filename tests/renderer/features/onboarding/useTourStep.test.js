import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useOnboardingStore } from '../../../../src/renderer/src/features/onboarding'
import {
  measureTarget,
  useTourStep
} from '../../../../src/renderer/src/features/onboarding/useTourStep'
import { useDiffStore } from '../../../../src/renderer/src/stores/diffStore'
import { useSettingsStore } from '../../../../src/renderer/src/stores/settingsStore'
import { useTabsStore } from '../../../../src/renderer/src/stores/tabsStore'
import { useUiStore } from '../../../../src/renderer/src/stores/uiStore'
import { useVaultStore } from '../../../../src/renderer/src/stores/vaultStore'

const SAMPLE = [
  { name: 'config-v1.json', path: null, content: '{"replicas":2}' },
  { name: 'config-v2.json', path: null, content: '{"replicas":3}' }
]
const OWN = [
  { name: 'mine-a.txt', path: null, content: 'a' },
  { name: 'mine-b.txt', path: null, content: 'b' }
]
const BOX = { x: 10, y: 20, w: 60, h: 26 }

let scope
let measure

function mount() {
  scope = effectScope()
  return scope.run(() => useTourStep({ measure }))
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    demoFiles: async () => SAMPLE.map((f) => ({ ...f })),
    vaultEncrypt: async (plaintext) => ({ iv: 'iv', data: plaintext })
  }
  measure = vi.fn(() => BOX)
  useTabsStore().init()
})
afterEach(() => scope?.stop())

async function atSave() {
  const step = mount()
  await useOnboardingStore().loadSample()
  await nextTick()
  return step
}

const saveSample = async (name = 'config-v1.json ↔ config-v2.json') => {
  const tabs = useTabsStore()
  const id = await useVaultStore().save(name, 1, useDiffStore().snapshot(), ['example'])
  tabs.active.entryId = id
  await nextTick()
  return id
}

describe('advancing', () => {
  it('moves from Save to Find when the sample is saved', async () => {
    await atSave()
    const tour = useOnboardingStore()
    expect(tour.step.id).toBe('save')
    await saveSample()
    expect(tour.step.id).toBe('find')
  })

  it('ignores a save of any other comparison', async () => {
    await atSave()
    const tour = useOnboardingStore()
    const tabs = useTabsStore()
    const sampleTab = tabs.activeId
    tabs.newTab()
    await useDiffStore().dropFiles(OWN.map((f) => ({ ...f })))
    await saveSample('mine')
    expect(tabs.activeId).not.toBe(sampleTab)
    expect(tour.step.id).toBe('save')
  })

  it('finishes when the search narrows to the saved sample', async () => {
    await atSave()
    await saveSample()
    const tour = useOnboardingStore()
    const ui = useUiStore()
    ui.sidebarQuery = 'zzz'
    await nextTick()
    expect(tour.step.id).toBe('find')
    ui.sidebarQuery = 'conf'
    await nextTick()
    expect(tour.isRunning).toBe(false)
    expect(tour.doneCard).toBe('core')
  })

  it('does not finish while a panel that lists no diffs is open', async () => {
    await atSave()
    await saveSample()
    useSettingsStore().setSidebarPanel('snippets')
    useUiStore().sidebarQuery = 'conf'
    await nextTick()
    expect(useOnboardingStore().step.id).toBe('find')
  })
})

describe('going off script', () => {
  it('closing the sample tab before the last step ends the tour as skipped', async () => {
    await atSave()
    const tabs = useTabsStore()
    tabs.newTab()
    await useDiffStore().dropFiles(OWN.map((f) => ({ ...f })))
    const sampleTab = useOnboardingStore().sample.tabId
    tabs.requestClose(sampleTab)
    await nextTick()
    const tour = useOnboardingStore()
    expect(tour.isRunning).toBe(false)
    expect(tour.tours.core).toBe('skipped')
    expect(tour.doneCard).toBeNull()
  })

  it('closing the only tab, which blanks it, also ends the tour', async () => {
    await atSave()
    const tabs = useTabsStore()
    tabs.requestClose(tabs.activeId)
    await nextTick()
    expect(useOnboardingStore().isRunning).toBe(false)
  })

  it('closing the sample tab on the last step leaves the tour running', async () => {
    await atSave()
    await saveSample()
    const tabs = useTabsStore()
    tabs.requestClose(tabs.activeId)
    await nextTick()
    expect(useOnboardingStore().step.id).toBe('find')
  })

  it('replacing the sample with files of one’s own makes it the user’s comparison', async () => {
    await atSave()
    const tabs = useTabsStore()
    const diff = useDiffStore()
    diff.receive('right', { ...OWN[1] })
    await nextTick()
    expect(tabs.active.sample).toBe(false)
    expect(useOnboardingStore().isRunning).toBe(false)
  })

  it('Escape never ends a tour', async () => {
    await atSave()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(useOnboardingStore().step.id).toBe('save')
  })

  it('a comparison of one’s own closes the offer', async () => {
    mount()
    const tour = useOnboardingStore()
    expect(tour.isOffering).toBe(true)
    await useDiffStore().dropFiles(OWN.map((f) => ({ ...f })))
    await nextTick()
    expect(tour.isOffering).toBe(false)
  })

  it('loading the sample does not count as a comparison of one’s own', async () => {
    await atSave()
    expect(useOnboardingStore().offer).toBe(true)
  })
})

describe('the coach mark and its target', () => {
  it('shows the step on its measured target', async () => {
    const step = await atSave()
    step.remeasure()
    expect(step.step.value.id).toBe('save')
    expect(step.visible.value).toBe(true)
    expect(step.rect.value).toEqual(BOX)
    expect(measure).toHaveBeenCalledWith('[data-tour="save"]')
  })

  it('hides while the target is off screen and comes back with it', async () => {
    const step = await atSave()
    measure.mockReturnValue(null)
    step.remeasure()
    expect(step.visible.value).toBe(false)
    measure.mockReturnValue(BOX)
    step.remeasure()
    expect(step.visible.value).toBe(true)
  })

  it('hides while another tab is on screen, and returns with the sample tab', async () => {
    const step = await atSave()
    const tabs = useTabsStore()
    const sampleTab = tabs.activeId
    tabs.newTab()
    step.remeasure()
    expect(step.visible.value).toBe(false)
    tabs.activate(sampleTab)
    step.remeasure()
    expect(step.visible.value).toBe(true)
  })

  it('draws no coach mark for the inline offer', () => {
    const step = mount()
    useOnboardingStore().start('core')
    step.remeasure()
    expect(step.step.value).toBeNull()
    expect(step.visible.value).toBe(false)
  })

  it('records the decided offer as it mounts', () => {
    mount()
    expect(JSON.parse(localStorage.getItem('diffbro.onboarding'))).toMatchObject({ schema: 2 })
  })
})

describe('measuring a target on the page', () => {
  const place = (box) => {
    const el = document.createElement('button')
    el.dataset.tour = 'probe'
    el.getBoundingClientRect = () => ({
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      right: box.x + box.w,
      bottom: box.y + box.h
    })
    document.body.append(el)
    return el
  }
  afterEach(() => {
    document.body.innerHTML = ''
    delete document.elementFromPoint
  })

  it('is null for a target that is not there', () => {
    expect(measureTarget('[data-tour="probe"]')).toBeNull()
  })

  it('is null for a target with no size or outside the window', () => {
    place({ x: 10, y: 10, w: 0, h: 0 })
    expect(measureTarget('[data-tour="probe"]')).toBeNull()
    document.body.innerHTML = ''
    place({ x: 10, y: -80, w: 40, h: 20 })
    expect(measureTarget('[data-tour="probe"]')).toBeNull()
  })

  it('is null while something else covers its centre', () => {
    place(BOX)
    document.elementFromPoint = () => document.body
    expect(measureTarget('[data-tour="probe"]')).toBeNull()
  })

  it('gives the box of a visible, uncovered target', () => {
    const el = place(BOX)
    document.elementFromPoint = () => el
    expect(measureTarget('[data-tour="probe"]')).toEqual(BOX)
  })
})
