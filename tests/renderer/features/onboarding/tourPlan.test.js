import { describe, expect, it } from 'vitest'
import {
  endedTours,
  isFreshProfile,
  isOfferOpen,
  isSampleFound,
  readOnboarding,
  storedOnboarding,
  tourStatus
} from '../../../../src/renderer/src/features/onboarding/tourPlan'

const EMPTY = { diffs: 0, snippets: [] }
const SEEDED = { diffs: 0, snippets: [{ tags: ['example'] }, { tags: ['example', 'prompt'] }] }

describe('who gets the inline offer', () => {
  it('offers it to a fresh install', () => {
    expect(isFreshProfile(null, EMPTY)).toBe(true)
    expect(readOnboarding(null, EMPTY).offer).toBe(true)
  })

  it('counts the seeded examples as nothing of the user’s own', () => {
    expect(readOnboarding(null, SEEDED).offer).toBe(true)
  })

  it('offers nothing to a profile with an onboarding file from an older version', () => {
    const old = { showTips: true, tourStep: 8, seenVersion: '0.5.0', deferred: 0 }
    expect(isFreshProfile(old, EMPTY)).toBe(false)
    expect(readOnboarding(old, EMPTY).offer).toBe(false)
  })

  it('offers nothing to a profile holding a saved diff', () => {
    expect(readOnboarding(null, { diffs: 1, snippets: [] }).offer).toBe(false)
  })

  it('offers nothing to a profile holding a snippet of its own', () => {
    const library = { diffs: 0, snippets: [...SEEDED.snippets, { tags: [] }] }
    expect(readOnboarding(null, library).offer).toBe(false)
  })

  it('keeps an offer already decided, whatever the library holds now', () => {
    const stored = { schema: 2, showTips: true, tours: {}, offer: true }
    expect(readOnboarding(stored, { diffs: 3, snippets: [] }).offer).toBe(true)
  })

  it('never offers once the core tour is skipped or finished', () => {
    expect(isOfferOpen({ offer: true, tours: { core: 'skipped' } })).toBe(false)
    expect(isOfferOpen({ offer: true, tours: { core: 'done' } })).toBe(false)
    expect(isOfferOpen({ offer: true, tours: {} })).toBe(true)
    expect(isOfferOpen({ offer: false, tours: {} })).toBe(false)
  })
})

describe('what is kept', () => {
  it('drops the old tour keys and keeps the tips switch', () => {
    const old = { showTips: false, tourStep: 3, seenVersion: '0.5.0', deferred: 2 }
    expect(storedOnboarding(readOnboarding(old, EMPTY))).toEqual({
      schema: 2,
      showTips: false,
      tours: {},
      offer: false
    })
  })

  it('says whether the stored shape is current', () => {
    expect(readOnboarding(null, EMPTY).current).toBe(false)
    expect(readOnboarding({ showTips: true }, EMPTY).current).toBe(false)
    expect(readOnboarding({ schema: 2, tours: {} }, EMPTY).current).toBe(true)
  })

  it('ignores a seen state it does not know', () => {
    const stored = { schema: 2, tours: { core: 'halfway', other: 'done', bad: 3 } }
    expect(readOnboarding(stored, EMPTY).tours).toEqual({ other: 'done' })
  })
})

describe('seen state per tour', () => {
  it('is never until the tour ends', () => {
    expect(tourStatus({}, 'core')).toBe('never')
    expect(tourStatus({ core: 'done' }, 'core')).toBe('done')
  })

  it('records how a tour ended', () => {
    expect(endedTours({}, 'core', 'skipped')).toEqual({ core: 'skipped' })
    expect(endedTours({ core: 'skipped' }, 'core', 'done')).toEqual({ core: 'done' })
  })

  it('never lets a skipped replay undo a finished tour', () => {
    expect(endedTours({ core: 'done' }, 'core', 'skipped')).toEqual({ core: 'done' })
  })
})

describe('when the search has found the sample', () => {
  const name = 'config-v1.json ↔ config-v2.json'

  it('is found once a few letters of its name are typed', () => {
    expect(isSampleFound({ query: 'conf', panel: 'home', name })).toBe(true)
    expect(isSampleFound({ query: 'V2.JSON', panel: 'diffs', name })).toBe(true)
  })

  it('is not found by an empty search, a tag scope or a miss', () => {
    expect(isSampleFound({ query: '   ', panel: 'home', name })).toBe(false)
    expect(isSampleFound({ query: '#conf', panel: 'home', name })).toBe(false)
    expect(isSampleFound({ query: 'mermaid', panel: 'home', name })).toBe(false)
  })

  it('is not found in a panel that does not list diffs', () => {
    expect(isSampleFound({ query: 'conf', panel: 'snippets', name })).toBe(false)
  })

  it('is not found before the sample has been saved', () => {
    expect(isSampleFound({ query: 'conf', panel: 'home', name: '' })).toBe(false)
  })
})
