import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useOnboardingStore } from '../../../../src/renderer/src/features/onboarding'
import { useTourStep } from '../../../../src/renderer/src/features/onboarding/useTourStep'
import { SAMPLE_LINE } from '../../../../src/renderer/src/features/onboarding/tourRegistry'
import { useSettingsStore } from '../../../../src/renderer/src/stores/settingsStore'
import { useSnippetStore } from '../../../../src/renderer/src/stores/snippetStore'
import { useTabsStore } from '../../../../src/renderer/src/stores/tabsStore'
import { useUiStore } from '../../../../src/renderer/src/stores/uiStore'
import {
  registerTabContent,
  unregisterTabContent
} from '../../../../src/renderer/src/utils/tabContent'

const BOX = { x: 10, y: 20, w: 60, h: 26 }
const DIALOG = { x: 400, y: 200, w: 440, h: 220 }
const FILL_DIALOG = '[data-tour="fill-dialog"]'

let scope
let measure
const drafts = []

function mount() {
  scope = effectScope()
  return scope.run(() => useTourStep({ measure }))
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    vaultEncrypt: async (plaintext) => ({ iv: 'iv', data: plaintext }),
    vaultDecrypt: async (box) => box.data
  }
  measure = vi.fn((selector) => (selector === FILL_DIALOG ? null : BOX))
  useTabsStore().init()
})
afterEach(() => {
  scope?.stop()
  for (const id of drafts.splice(0)) unregisterTabContent(id)
})

function openDraft() {
  const tabs = useTabsStore()
  const id = tabs.openSnippet({ id: null })
  const content = ref('')
  registerTabContent(
    id,
    () => ({ name: '', content: content.value, language: 'auto', secret: false, snippetId: null }),
    (next) => (content.value = next)
  )
  drafts.push(id)
  return { id, content }
}

async function type(draft, text) {
  draft.content.value = text
  useTabsStore().setSnippetMeta(draft.id, { dirty: true })
  await nextTick()
}

async function started() {
  const step = mount()
  await useOnboardingStore().startTour('snippets')
  await nextTick()
  return step
}

async function atBlank() {
  const step = await started()
  const draft = openDraft()
  await nextTick()
  return { step, draft }
}

async function atCopy() {
  const { step, draft } = await atBlank()
  await type(draft, SAMPLE_LINE)
  useTabsStore().setSnippetMeta(draft.id, { snippetId: 'mine' })
  await nextTick()
  return { step, draft }
}

describe('starting the Snippets tour', () => {
  it('shows the Snippets panel with the search cleared, on step 1 of 4', async () => {
    useUiStore().sidebarQuery = 'conf'
    await started()
    const tour = useOnboardingStore()
    expect(useSettingsStore().sidebarPanel).toBe('snippets')
    expect(useUiStore().sidebarQuery).toBe('')
    expect(tour.step.id).toBe('new')
    expect([tour.stepNumber, tour.stepCount]).toEqual([1, 4])
    expect(tour.labelKey).toBe('onboarding.snippets.label')
  })

  it('does not put the core tour’s sample offer up', async () => {
    await started()
    expect(useOnboardingStore().isOffering).toBe(false)
  })
})

describe('advancing the Snippets tour', () => {
  it('moves on when a new snippet editor opens, and follows that tab', async () => {
    const { draft } = await atBlank()
    const tour = useOnboardingStore()
    expect(tour.step.id).toBe('blank')
    expect(tour.tourTabId).toBe(draft.id)
  })

  it('does not move on when an existing snippet opens', async () => {
    await started()
    useTabsStore().openSnippet({ id: 'saved-one' })
    await nextTick()
    expect(useOnboardingStore().step.id).toBe('new')
  })

  it('waits until the text holds a {{…}} blank', async () => {
    const { draft } = await atBlank()
    await type(draft, 'Deploying service to staging')
    expect(useOnboardingStore().step.id).toBe('blank')
    await type(draft, 'Deploying {{service}} to staging')
    expect(useOnboardingStore().step.id).toBe('name-save')
  })

  it('Use a sample fills exactly the sample line', async () => {
    const { draft } = await atBlank()
    useOnboardingStore().fillSample()
    expect(draft.content.value).toBe('Deploying {{service}} to staging on {{today}}')
  })

  it('moves on when this snippet is saved, and remembers which one it was', async () => {
    const { draft } = await atBlank()
    await type(draft, SAMPLE_LINE)
    useTabsStore().setSnippetMeta(draft.id, { snippetId: 'mine' })
    await nextTick()
    const tour = useOnboardingStore()
    expect(tour.step.id).toBe('copy')
    expect(tour.snippetId).toBe('mine')
  })

  it('a save of another snippet does not advance', async () => {
    const { draft } = await atBlank()
    await type(draft, SAMPLE_LINE)
    const other = openDraft()
    await type(other, 'Another {{thing}}')
    useTabsStore().setSnippetMeta(other.id, { snippetId: 'theirs' })
    await nextTick()
    expect(useOnboardingStore().step.id).toBe('name-save')
  })

  it('cancel in Fill in waits on the Copy step', async () => {
    await atCopy()
    const snippets = useSnippetStore()
    snippets.pendingFill = { name: 'Deploy', content: SAMPLE_LINE, snippetId: 'mine' }
    await nextTick()
    snippets.pendingFill = null
    await nextTick()
    const tour = useOnboardingStore()
    expect(tour.isRunning).toBe(true)
    expect(tour.step.id).toBe('copy')
  })

  it('a fill of another snippet does not finish it', async () => {
    await atCopy()
    useUiStore().lastSnippetFill = { snippetId: 'theirs' }
    await nextTick()
    expect(useOnboardingStore().step.id).toBe('copy')
  })

  it('Copy filled finishes the tour, with no closing card', async () => {
    await atCopy()
    useUiStore().lastSnippetFill = { snippetId: 'mine' }
    await nextTick()
    const tour = useOnboardingStore()
    expect(tour.isRunning).toBe(false)
    expect(tour.tours.snippets).toBe('done')
    expect(tour.doneCard).toBeNull()
  })
})

describe('the Snippets tour off script', () => {
  it('closing its snippet tab before the last step ends it quietly as skipped', async () => {
    const { draft } = await atBlank()
    useTabsStore().closeMany([draft.id])
    await nextTick()
    const tour = useOnboardingStore()
    expect(tour.isRunning).toBe(false)
    expect(tour.tours.snippets).toBe('skipped')
    expect(tour.doneCard).toBeNull()
  })

  it('Escape never ends it', async () => {
    await atBlank()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(useOnboardingStore().step.id).toBe('blank')
  })

  it('hides the coach mark while another tab is in front, and brings it back', async () => {
    const { step, draft } = await atBlank()
    const tabs = useTabsStore()
    tabs.newTab()
    step.remeasure()
    expect(step.visible.value).toBe(false)
    tabs.activate(draft.id)
    step.remeasure()
    expect(step.visible.value).toBe(true)
  })
})

describe('the Snippets tour’s coach marks', () => {
  it('rings + on the first step', async () => {
    const step = await started()
    step.remeasure()
    expect(measure).toHaveBeenCalledWith('[data-tour="snippet-new"]')
    expect(step.rings.value).toEqual([{ rect: BOX, zone: false }])
  })

  it('draws no ring around the editor on the blank step', async () => {
    const { step } = await atBlank()
    step.remeasure()
    expect(step.visible.value).toBe(true)
    expect(step.rings.value).toEqual([])
  })

  it('rings the name field and Save together', async () => {
    const { step, draft } = await atBlank()
    await type(draft, SAMPLE_LINE)
    step.remeasure()
    expect(measure).toHaveBeenCalledWith('[data-tour="snippet-name"]')
    expect(step.rings.value).toHaveLength(2)
  })

  it('moves beside the Fill in dialog while it is open, and back to Copy after', async () => {
    const { step } = await atCopy()
    step.remeasure()
    expect(step.step.value.titleKey).toBe('onboarding.snippets.copy.title')
    measure.mockImplementation((selector) => (selector === FILL_DIALOG ? DIALOG : null))
    step.remeasure()
    expect(step.step.value.titleKey).toBe('onboarding.snippets.fill.title')
    expect(step.rect.value).toEqual(DIALOG)
    expect(step.rings.value).toEqual([])
    measure.mockImplementation((selector) => (selector === FILL_DIALOG ? null : BOX))
    step.remeasure()
    expect(step.step.value.titleKey).toBe('onboarding.snippets.copy.title')
  })
})
