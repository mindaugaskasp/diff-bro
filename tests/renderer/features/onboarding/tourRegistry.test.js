import { describe, expect, it } from 'vitest'
import { TOURS, tourById } from '../../../../src/renderer/src/features/onboarding/tourRegistry'
import EN from '../../../../src/shared/i18n/en.json'

const hasKey = (key) => key.split('.').reduce((node, part) => node?.[part], EN) !== undefined
const CORE_EVENTS = ['sample-opened', 'sample-saved', 'sample-found']
const SNIPPET_EVENTS = ['snippet-opened', 'snippet-blank', 'snippet-saved', 'snippet-filled']
const DIAGRAM_EVENTS = ['diagram-opened', 'diagram-compared', 'diagram-dropped']
const EVENTS = [...CORE_EVENTS, ...SNIPPET_EVENTS, ...DIAGRAM_EVENTS]
const TARGET = /^\[data-(tour="[a-z-]+"|snippet-id="\{(example|v2)\}")\]$/

const allSteps = () => TOURS.flatMap((t) => t.steps)
const copyKeys = (tour) => [
  tour.labelKey,
  tour.nameKey,
  tour.doneCard?.titleKey,
  tour.doneCard?.bodyKey,
  ...tour.steps.flatMap((s) => [s.titleKey, s.bodyKey, s.actionKey, s.nameKey]),
  ...tour.steps.flatMap((s) => [s.alt?.titleKey, s.alt?.bodyKey])
]

describe('the tour registry', () => {
  it('gives every tour an id, a release, a label and at least one step', () => {
    for (const tour of TOURS) {
      expect(tour.id).toMatch(/^[a-z-]+$/)
      expect(tour.introducedIn).toMatch(/^\d+\.\d+\.\d+$/)
      expect(tour.labelKey).toBeTruthy()
      expect(tour.steps.length).toBeGreaterThan(0)
    }
  })

  it('keeps tour ids unique', () => {
    const ids = TOURS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('makes every step wait for a known event and point at a target', () => {
    for (const step of allSteps()) {
      expect(EVENTS).toContain(step.advanceOn)
      expect(step.target).toMatch(TARGET)
      for (const extra of [...(step.also ?? []), step.alt?.target].filter(Boolean)) {
        expect(extra).toMatch(TARGET)
      }
    }
  })

  it('names copy that exists in the catalogue', () => {
    for (const tour of TOURS) {
      for (const key of copyKeys(tour).filter(Boolean)) expect(hasKey(key), key).toBe(true)
    }
  })

  it('has the core tour: drop the samples, save them, find them', () => {
    const core = tourById('core')
    expect(core.steps.map((s) => s.advanceOn)).toEqual(CORE_EVENTS)
    expect(core.steps[0].inline).toBe(true)
    expect(core.steps[1].onTab).toBe(true)
  })

  it('ends the core tour on a card offering the Snippets and Diagrams tours', () => {
    expect(tourById('core').doneCard.next).toEqual(['snippets', 'diagrams'])
    for (const id of tourById('core').doneCard.next) expect(tourById(id).nameKey).toBeTruthy()
  })

  it('has the Snippets tour: +, a blank, name and Save, Copy and fill', () => {
    const tour = tourById('snippets')
    expect(tour.steps.map((s) => s.advanceOn)).toEqual(SNIPPET_EVENTS)
    const [plus, blank, save, copy] = tour.steps
    expect(plus.target).toBe('[data-tour="snippet-new"]')
    expect(blank.tokens).toEqual(['service', 'today'])
    expect(blank.actionKey).toBeTruthy()
    expect(save.target).toBe('[data-tour="snippet-save"]')
    expect(save.also).toEqual(['[data-tour="snippet-name"]'])
    expect(copy.target).toBe('[data-tour="snippet-copy"]')
    expect(copy.alt.target).toBe('[data-tour="fill-dialog"]')
    expect([blank, save, copy].every((s) => s.onTab)).toBe(true)
    expect(tour.doneCard).toBeUndefined()
  })

  it('has the Diagrams tour: open the example, Compare with…, drop v2 on the right', () => {
    const tour = tourById('diagrams')
    expect(tour.steps.map((s) => s.advanceOn)).toEqual(DIAGRAM_EVENTS)
    const [open, compare, drop] = tour.steps
    expect(open.target).toBe('[data-snippet-id="{example}"]')
    expect(compare.target).toBe('[data-tour="snippet-compare"]')
    expect(drop.target).toBe('[data-tour="pane-right"]')
    expect(drop.zone).toBe(true)
    expect(drop.also).toEqual(['[data-snippet-id="{v2}"]'])
    expect(tour.doneCard.titleKey).toBeTruthy()
  })

  it('answers null for a tour that does not exist', () => {
    expect(tourById('share')).toBeNull()
  })
})
