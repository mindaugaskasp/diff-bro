import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useOnboardingStore } from '../../../../src/renderer/src/features/onboarding'
import { useTourStep } from '../../../../src/renderer/src/features/onboarding/useTourStep'
import { useDiffStore } from '../../../../src/renderer/src/stores/diffStore'
import { useSnippetStore } from '../../../../src/renderer/src/stores/snippetStore'
import { useTabsStore } from '../../../../src/renderer/src/stores/tabsStore'

const BOX = { x: 10, y: 20, w: 60, h: 26 }
const ORIGINAL = 'Example — Mermaid diagram'
const V2 = 'Example — Mermaid diagram, v2'
const PROMPT = 'Example — Claude review prompt'

let scope
let measure

const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick()
}
const idOf = (name) => useSnippetStore().entries.find((e) => e.name === name)?.id

beforeEach(async () => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    vaultEncrypt: async (plaintext) => ({ iv: 'iv', data: plaintext }),
    vaultDecrypt: async (box) => box.data
  }
  measure = vi.fn(() => BOX)
  useTabsStore().init()
  await useSnippetStore().seedExamples()
})
afterEach(() => scope?.stop())

async function started() {
  scope = effectScope()
  const step = scope.run(() => useTourStep({ measure }))
  await useOnboardingStore().startTour('diagrams')
  await flush()
  return step
}

async function atCompare() {
  const step = await started()
  useTabsStore().openSnippet({ id: idOf(ORIGINAL) }, ORIGINAL)
  await flush()
  return step
}

async function atDrop() {
  const step = await atCompare()
  await useDiffStore().dropSnippets([idOf(ORIGINAL)], 'left')
  await flush()
  return step
}

describe('starting the Diagrams tour', () => {
  it('finds both example diagrams', async () => {
    await started()
    const tour = useOnboardingStore()
    expect(tour.examples).toEqual({ example: idOf(ORIGINAL), v2: idOf(V2) })
    expect(tour.step.id).toBe('open')
    expect(tour.labelKey).toBe('onboarding.diagrams.label')
  })

  it('puts a missing example back before it starts, tagged example', async () => {
    useSnippetStore().remove(idOf(V2))
    await started()
    const v2 = useSnippetStore().entries.find((e) => e.name === V2)
    expect(v2.tags).toContain('example')
    expect(useOnboardingStore().examples.v2).toBe(v2.id)
  })
})

describe('advancing the Diagrams tour', () => {
  it('moves on when the example diagram opens', async () => {
    await atCompare()
    const tour = useOnboardingStore()
    expect(tour.step.id).toBe('compare')
    expect(tour.tourTabId).toBe(useTabsStore().activeId)
  })

  it('does not move on when v2 opens instead', async () => {
    await started()
    useTabsStore().openSnippet({ id: idOf(V2) }, V2)
    await flush()
    expect(useOnboardingStore().step.id).toBe('open')
  })

  it('moves on when a comparison opens with the example on the left', async () => {
    await atDrop()
    const tabs = useTabsStore()
    const tour = useOnboardingStore()
    expect(tour.step.id).toBe('drop')
    expect(useDiffStore().left.snippetId).toBe(idOf(ORIGINAL))
    expect(tour.tourTabId).toBe(tabs.activeId)
  })

  it('finishes on v2 dropped on the right, in the diagram view, with its card', async () => {
    await atDrop()
    await useDiffStore().dropSnippets([idOf(V2)], 'right')
    await flush()
    const tour = useOnboardingStore()
    expect(tour.isRunning).toBe(false)
    expect(tour.tours.diagrams).toBe('done')
    expect(tour.doneCard).toBe('diagrams')
    expect(useDiffStore().comparableKind).toBe('diagram')
  })

  it('does not finish when another snippet is dropped on the right', async () => {
    await atDrop()
    await useDiffStore().dropSnippets([idOf(PROMPT)], 'right')
    await flush()
    expect(useOnboardingStore().step.id).toBe('drop')
  })
})

describe('the Diagrams tour off script', () => {
  it('closing the example’s tab before comparing ends it quietly as skipped', async () => {
    await atCompare()
    const tabs = useTabsStore()
    tabs.closeMany([tabs.activeId])
    await flush()
    const tour = useOnboardingStore()
    expect(tour.isRunning).toBe(false)
    expect(tour.tours.diagrams).toBe('skipped')
    expect(tour.doneCard).toBeNull()
  })

  it('closing the comparison before v2 is dropped ends it quietly as skipped', async () => {
    await atDrop()
    const tabs = useTabsStore()
    tabs.closeMany([tabs.activeId])
    await flush()
    expect(useOnboardingStore().tours.diagrams).toBe('skipped')
  })
})

describe('the Diagrams tour’s coach marks', () => {
  it('rings the example’s own row', async () => {
    const step = await started()
    step.remeasure()
    expect(measure).toHaveBeenCalledWith(`[data-snippet-id="${idOf(ORIGINAL)}"]`)
    expect(step.visible.value).toBe(true)
  })

  it('outlines the right pane as a zone and rings the v2 row', async () => {
    const step = await atDrop()
    step.remeasure()
    expect(measure).toHaveBeenCalledWith('[data-tour="pane-right"]')
    expect(measure).toHaveBeenCalledWith(`[data-snippet-id="${idOf(V2)}"]`)
    expect(step.rings.value).toEqual([
      { rect: BOX, zone: true },
      { rect: BOX, zone: false }
    ])
  })
})
