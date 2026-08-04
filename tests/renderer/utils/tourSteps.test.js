import { describe, expect, it } from 'vitest'
import {
  TOUR_STEPS,
  TOUR_VERSION,
  runBlockAt,
  tourPlan
} from '../../../src/renderer/src/utils/tourSteps'
import { COMMANDS } from '../../../src/renderer/src/utils/commands'

const state = (over = {}) => ({
  showTips: true,
  tourStep: 0,
  seenVersion: '',
  tourDeferred: 0,
  ...over
})

const runTwoStart = TOUR_STEPS.findIndex((s) => s.run === 2)
const RUN_ONE = runTwoStart

describe('TOUR_STEPS', () => {
  it('splits six steps into run one and four into run two', () => {
    expect(TOUR_STEPS.filter((s) => s.run === 1)).toHaveLength(RUN_ONE)
    expect(TOUR_STEPS.filter((s) => s.run === 2)).toHaveLength(4)
  })

  it('ends run one on the tips row, so the off switch is the last thing shown', () => {
    const runOne = TOUR_STEPS.filter((s) => s.run === 1)
    expect(runOne.at(-1).id).toBe('settings-tips')
  })

  // A step names its command as a string, so a rename or a typo is invisible
  // until someone presses Next and nothing happens.
  it('names only commands the registry actually has', () => {
    const named = TOUR_STEPS.flatMap((s) => [s.advance, s.enter, s.leave, s.undo]).filter(Boolean)
    expect(named.filter((a) => !COMMANDS[a])).toEqual([])
    expect(named.length).toBeGreaterThan(0)
  })

  // The inversion: a command fires on Next, never on arrival. `command` was the
  // field that fired on entry, and it is what made windows appear unannounced.
  it('has no step left firing on entry', () => {
    expect(TOUR_STEPS.filter((s) => s.command)).toEqual([])
  })

  // Blocked is the DEFAULT, not something each step opts into one at a time —
  // that is how a file slot stayed clickable under the card pointing at it.
  it('leaves its hole live only where the step asks for the press', () => {
    expect(TOUR_STEPS.filter((s) => s.live).map((s) => s.id)).toStrictEqual(['snippet-save'])
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
    expect(runBlockAt(0).map((s) => s.run)).toStrictEqual(Array(RUN_ONE).fill(1))
  })

  it('returns the remainder of a run when resuming mid-way', () => {
    expect(runBlockAt(2).map((s) => s.id)).toStrictEqual(
      TOUR_STEPS.slice(2, RUN_ONE).map((s) => s.id)
    )
  })

  it('stops at the run boundary rather than running on into run two', () => {
    expect(runBlockAt(RUN_ONE - 1).every((s) => s.run === 1)).toBe(true)
  })

  it('is empty past the end', () => {
    expect(runBlockAt(TOUR_STEPS.length)).toStrictEqual([])
  })
})

describe('tourPlan', () => {
  it('plays run one on a cold first launch', () => {
    const plan = tourPlan(state())
    expect(plan.mode).toBe('steps')
    expect(plan.steps).toHaveLength(RUN_ONE)
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
    expect(plan.steps.map((s) => s.id)).toStrictEqual(TOUR_STEPS.slice(2, RUN_ONE).map((s) => s.id))
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
      ...state({ tourStep: steps.length, seenVersion: '0.5.0' }),
      // a step introduced after the version last seen
      allSteps: [...steps, { id: 'future', run: 3, since: '9.0.0', target: '#x', body: 'b' }]
    })
    expect(plan.mode).toBe('steps')
    expect(plan.steps.map((s) => s.id)).toStrictEqual(['future'])
  })

  it('compares versions numerically, not as strings', () => {
    const plan = tourPlan({
      ...state({ tourStep: TOUR_STEPS.length, seenVersion: '0.9.0' }),
      allSteps: [{ id: 'ten', run: 3, since: '0.10.0', target: '#x', body: 'b' }]
    })
    expect(plan.steps.map((s) => s.id)).toStrictEqual(['ten'])
  })
})
