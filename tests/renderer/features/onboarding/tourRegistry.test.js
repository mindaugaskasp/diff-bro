import { describe, expect, it } from 'vitest'
import { TOURS, tourById } from '../../../../src/renderer/src/features/onboarding/tourRegistry'
import EN from '../../../../src/shared/i18n/en.json'

const hasKey = (key) => key.split('.').reduce((node, part) => node?.[part], EN) !== undefined
const EVENTS = ['sample-opened', 'sample-saved', 'sample-found']

describe('the tour registry', () => {
  it('gives every tour an id, a release and at least one step', () => {
    for (const tour of TOURS) {
      expect(tour.id).toMatch(/^[a-z-]+$/)
      expect(tour.introducedIn).toMatch(/^\d+\.\d+\.\d+$/)
      expect(tour.steps.length).toBeGreaterThan(0)
    }
  })

  it('keeps tour ids unique', () => {
    const ids = TOURS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('makes every step wait for a known event and point at a data-tour target', () => {
    for (const step of TOURS.flatMap((t) => t.steps)) {
      expect(EVENTS).toContain(step.advanceOn)
      expect(step.target).toMatch(/^\[data-tour="[a-z-]+"\]$/)
    }
  })

  it('names copy that exists in the catalogue', () => {
    for (const step of TOURS.flatMap((t) => t.steps)) {
      for (const key of [step.titleKey, step.bodyKey].filter(Boolean)) {
        expect(hasKey(key), key).toBe(true)
      }
    }
  })

  it('has the core tour: drop the samples, save them, find them', () => {
    const core = tourById('core')
    expect(core.steps.map((s) => s.advanceOn)).toEqual(EVENTS)
    expect(core.steps[0].inline).toBe(true)
    expect(core.steps[1].onSample).toBe(true)
  })

  it('answers null for a tour that does not exist', () => {
    expect(tourById('share')).toBeNull()
  })
})
