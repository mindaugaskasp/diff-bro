import { describe, expect, it } from 'vitest'
import {
  TOUR_STEPS,
  TOUR_VERSION,
  runBlockAt,
  tourPlan
} from '../../../src/renderer/src/utils/tourSteps'

const state = (over = {}) => ({
  showTips: true,
  tourStep: 0,
  seenVersion: '',
  tourDeferred: 0,
  version: TOUR_VERSION,
  ...over
})

const runTwoStart = TOUR_STEPS.findIndex((s) => s.run === 2)

describe('TOUR_STEPS', () => {
  it('splits four steps into run one and three into run two', () => {
    expect(TOUR_STEPS.filter((s) => s.run === 1)).toHaveLength(4)
    expect(TOUR_STEPS.filter((s) => s.run === 2)).toHaveLength(3)
  })

  it('ends run one on settings, so the off switch is the last thing shown', () => {
    const runOne = TOUR_STEPS.filter((s) => s.run === 1)
    expect(runOne.at(-1).id).toBe('settings')
  })

  it('keeps the runs contiguous — run two never interleaves with run one', () => {
    const runs = TOUR_STEPS.map((s) => s.run)
    expect(runs).toStrictEqual([...runs].sort((a, b) => a - b))
  })

  it('gives every step a target and a body', () => {
    for (const step of TOUR_STEPS) {
      expect(step.target, step.id).toBeTruthy()
      expect(step.body, step.id).toBeTruthy()
      expect(step.since, step.id).toBeTruthy()
    }
  })
})

describe('runBlockAt', () => {
  it('returns the whole of run one from the start', () => {
    expect(runBlockAt(0).map((s) => s.run)).toStrictEqual([1, 1, 1, 1])
  })

  it('returns the remainder of a run when resuming mid-way', () => {
    expect(runBlockAt(2).map((s) => s.id)).toStrictEqual(TOUR_STEPS.slice(2, 4).map((s) => s.id))
  })

  it('stops at the run boundary rather than running on into run two', () => {
    expect(runBlockAt(3).every((s) => s.run === 1)).toBe(true)
  })

  it('is empty past the end', () => {
    expect(runBlockAt(TOUR_STEPS.length)).toStrictEqual([])
  })
})

describe('tourPlan', () => {
  it('plays run one on a cold first launch', () => {
    const plan = tourPlan(state())
    expect(plan.mode).toBe('steps')
    expect(plan.steps).toHaveLength(4)
  })

  it('shows nothing at all when tips are off', () => {
    expect(tourPlan(state({ showTips: false })).mode).toBe('none')
  })

  it('shows nothing when tips are off even mid-run — a skip is an answer', () => {
    expect(tourPlan(state({ showTips: false, tourStep: 2 })).mode).toBe('none')
  })

  it('resumes mid-run-one where it left off', () => {
    const plan = tourPlan(state({ tourStep: 2 }))
    expect(plan.mode).toBe('steps')
    expect(plan.steps.map((s) => s.id)).toStrictEqual(TOUR_STEPS.slice(2, 4).map((s) => s.id))
  })

  it('asks before run two rather than starting it unannounced', () => {
    expect(tourPlan(state({ tourStep: runTwoStart })).mode).toBe('prompt')
  })

  it('re-asks exactly once after a Not now', () => {
    expect(tourPlan(state({ tourStep: runTwoStart, tourDeferred: 1 })).mode).toBe('prompt')
    expect(tourPlan(state({ tourStep: runTwoStart, tourDeferred: 2 })).mode).toBe('none')
  })

  it('resumes run two without re-asking once it has been started', () => {
    const plan = tourPlan(state({ tourStep: runTwoStart + 1, tourDeferred: 1 }))
    expect(plan.mode).toBe('steps')
    expect(plan.steps.every((s) => s.run === 2)).toBe(true)
  })

  it('shows nothing once both runs are done and the version has not moved', () => {
    const done = state({ tourStep: TOUR_STEPS.length, seenVersion: TOUR_VERSION })
    expect(tourPlan(done).mode).toBe('none')
  })

  it('plays only the genuinely new steps after an update', () => {
    const steps = [...TOUR_STEPS]
    const plan = tourPlan({
      ...state({ tourStep: steps.length, seenVersion: '0.5.0', version: '9.9.9' }),
      // a step introduced after the version last seen
      allSteps: [...steps, { id: 'future', run: 3, since: '9.0.0', target: '#x', body: 'b' }]
    })
    expect(plan.mode).toBe('steps')
    expect(plan.steps.map((s) => s.id)).toStrictEqual(['future'])
  })

  it('shows nothing after an update that introduced no new step', () => {
    const done = state({ tourStep: TOUR_STEPS.length, seenVersion: TOUR_VERSION, version: '9.9.9' })
    expect(tourPlan(done).mode).toBe('none')
  })

  it('compares versions numerically, not as strings', () => {
    const plan = tourPlan({
      ...state({ tourStep: TOUR_STEPS.length, seenVersion: '0.9.0', version: '0.10.0' }),
      allSteps: [{ id: 'ten', run: 3, since: '0.10.0', target: '#x', body: 'b' }]
    })
    expect(plan.steps.map((s) => s.id)).toStrictEqual(['ten'])
  })
})
