import { describe, expect, it } from 'vitest'
import {
  TOUR_STEPS,
  TOUR_TOPICS,
  TOUR_VERSION,
  tourPlan
} from '../../../src/renderer/src/utils/tourSteps'
import { COMMANDS } from '../../../src/renderer/src/utils/commands'
import { createTranslator } from '../../../src/shared/i18n'

const t = createTranslator('en')

const state = (over = {}) => ({
  showTips: true,
  tourStep: 0,
  seenVersion: '',
  tourDeferred: 0,
  ...over
})

describe('TOUR_STEPS', () => {
  it('is one run of eight steps', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toStrictEqual([
      'compare',
      'share',
      'library',
      'quick-look',
      'snippet-new',
      'snippet-save',
      'diagram-open',
      'diagram'
    ])
    expect(TOUR_STEPS.filter((s) => 'run' in s)).toEqual([])
  })

  // A step names its command as a string, so a rename or a typo is invisible
  // until someone presses Next and nothing happens.
  it('names only commands the registry actually has', () => {
    const named = TOUR_STEPS.flatMap((s) => [s.advance, s.enter, s.leave, s.undo]).filter(Boolean)
    expect(named.filter((a) => !COMMANDS[a])).toEqual([])
    expect(named.length).toBeGreaterThan(0)
  })

  it('has no step left firing on entry', () => {
    expect(TOUR_STEPS.filter((s) => s.command)).toEqual([])
  })

  it('leaves its hole live only where the step asks for the press', () => {
    expect(TOUR_STEPS.filter((s) => s.live).map((s) => s.id)).toStrictEqual(['snippet-save'])
  })

  it('gives every step a target and a body', () => {
    for (const step of TOUR_STEPS) {
      expect(step.target, step.id).toBeTruthy()
      expect(t(step.bodyKey), step.id).not.toBe(step.bodyKey)
      expect(t(step.titleKey), step.id).not.toBe(step.titleKey)
      expect(step.since, step.id).toBeTruthy()
    }
  })

  // The keys were moved to a rail panel; a step naming the old menu path sends
  // people to something that is not there.
  it('names no menu path that no longer exists', () => {
    const copy = TOUR_STEPS.map((s) => t(s.bodyKey)).join(' ')
    expect(copy).not.toMatch(/Security ▸|Fourteen themes/)
  })
})

describe('TOUR_TOPICS', () => {
  it('names each topic in the catalogue with an icon', () => {
    expect(TOUR_TOPICS.length).toBeGreaterThan(2)
    for (const topic of TOUR_TOPICS) {
      expect(topic.icon).toBeTruthy()
      expect(t(topic.labelKey)).not.toBe(topic.labelKey)
    }
  })
})

describe('tourPlan', () => {
  it('asks before a cold first launch rather than dropping the veil', () => {
    const plan = tourPlan(state())
    expect(plan.mode).toBe('prompt')
    expect(plan.kind).toBe('intro')
    expect(plan.steps).toHaveLength(TOUR_STEPS.length)
  })

  it('shows nothing at all when tips are off', () => {
    expect(tourPlan(state({ showTips: false })).mode).toBe('none')
  })

  it('shows nothing when tips are off even mid-tour — a skip is an answer', () => {
    expect(tourPlan(state({ showTips: false, tourStep: 2 })).mode).toBe('none')
  })

  it('resumes a tour already agreed to without asking again', () => {
    const plan = tourPlan(state({ tourStep: 2 }))
    expect(plan.mode).toBe('steps')
    expect(plan.steps.map((s) => s.id)).toStrictEqual(TOUR_STEPS.slice(2).map((s) => s.id))
  })

  it('re-asks exactly once after a Not now', () => {
    expect(tourPlan(state({ tourDeferred: 1 })).mode).toBe('prompt')
    expect(tourPlan(state({ tourDeferred: 2 })).mode).toBe('none')
  })

  it('shows nothing once the tour is done and the version has not moved', () => {
    const done = state({ tourStep: TOUR_STEPS.length, seenVersion: TOUR_VERSION })
    expect(tourPlan(done).mode).toBe('none')
  })

  it('asks about the genuinely new steps after an update', () => {
    const plan = tourPlan({
      ...state({ tourStep: TOUR_STEPS.length, seenVersion: '0.5.0' }),
      allSteps: [...TOUR_STEPS, { id: 'future', since: '9.0.0', target: '#x' }]
    })
    expect(plan.mode).toBe('prompt')
    expect(plan.kind).toBe('update')
    expect(plan.steps.map((s) => s.id)).toStrictEqual(['future'])
  })

  it('stops asking about an update after two Not nows', () => {
    const plan = tourPlan({
      ...state({ tourStep: TOUR_STEPS.length, seenVersion: '0.5.0', tourDeferred: 2 }),
      allSteps: [...TOUR_STEPS, { id: 'future', since: '9.0.0', target: '#x' }]
    })
    expect(plan.mode).toBe('none')
  })

  it('compares versions numerically, not as strings', () => {
    const plan = tourPlan({
      ...state({ tourStep: 1, seenVersion: '0.9.0' }),
      allSteps: [{ id: 'ten', since: '0.10.0', target: '#x' }]
    })
    expect(plan.steps.map((s) => s.id)).toStrictEqual(['ten'])
  })
})
