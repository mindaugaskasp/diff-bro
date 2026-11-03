import { describe, expect, it } from 'vitest'
import { TOURS } from '../../../../src/renderer/src/features/onboarding/tourRegistry'
import {
  compareVersions,
  endedTours,
  isNewTour,
  pendingReleases,
  releaseOffer,
  settledReleases,
  tourRows,
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
    const stored = { schema: 2, offerTours: true, tours: {}, offer: true }
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
  it('drops every key an older version wrote, the old tips switch included', () => {
    const old = { showTips: false, tourStep: 3, seenVersion: '0.5.0', deferred: 2 }
    expect(storedOnboarding(readOnboarding(old, EMPTY))).toEqual({
      schema: 2,
      offerTours: true,
      tours: {},
      offer: false,
      version: null,
      known: []
    })
  })

  it('keeps the update switch, the version and the known release tours', () => {
    const stored = {
      schema: 2,
      offerTours: false,
      tours: {},
      offer: false,
      version: '0.17.0',
      known: ['run', 3]
    }
    expect(readOnboarding(stored, EMPTY)).toMatchObject({
      offerTours: false,
      version: '0.17.0',
      known: ['run']
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

const release = (id, introducedIn) => ({
  id,
  introducedIn,
  release: true,
  nameKey: `fixture.${id}`,
  steps: [{ id: 'one' }, { id: 'two' }]
})
const REGISTRY = [
  { id: 'core', introducedIn: '0.16.0', nameKey: 'core', steps: [{ id: 'a' }] },
  release('run', '0.17.0'),
  release('share', '0.18.0'),
  release('future', '0.19.0')
]
const QUIET = { running: false, dialogOpen: false, doneCard: false }
const userAt = (version, more = {}) => ({
  offerTours: true,
  tours: {},
  version,
  known: [],
  ...more
})

describe('comparing versions', () => {
  it('orders by number, part by part', () => {
    expect(compareVersions('0.17.0', '0.16.9')).toBeGreaterThan(0)
    expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })
})

describe('release tours on the first launch of a version', () => {
  it('marks every release tour up to this version as known on a fresh install', () => {
    const settled = settledReleases(userAt(null), REGISTRY, '0.18.0')
    expect(settled).toEqual({ version: '0.18.0', known: ['run', 'share'] })
    expect(pendingReleases({ ...userAt(null), ...settled }, REGISTRY, '0.18.0')).toEqual([])
  })

  it('leaves an existing user’s version alone, so the tours since are still to offer', () => {
    const state = userAt('0.16.0')
    expect(settledReleases(state, REGISTRY, '0.18.0')).toEqual({ version: '0.16.0', known: [] })
  })

  it('offers the one tour a release ships', () => {
    expect(pendingReleases(userAt('0.16.0'), REGISTRY, '0.17.0')).toEqual(['run'])
  })

  it('offers nothing on a release that ships no tour', () => {
    expect(pendingReleases(userAt('0.16.0'), REGISTRY, '0.16.3')).toEqual([])
  })

  it('merges the tours of every version skipped into one offer', () => {
    expect(pendingReleases(userAt('0.16.0'), REGISTRY, '0.18.2')).toEqual(['run', 'share'])
  })

  it('never offers a tour from a version not yet installed', () => {
    expect(pendingReleases(userAt('0.16.0'), REGISTRY, '0.18.0')).not.toContain('future')
  })

  it('offers once: after it is shown, the version moves and nothing is pending', () => {
    expect(pendingReleases(userAt('0.18.0'), REGISTRY, '0.18.0')).toEqual([])
  })

  it('leaves out a tour already taken or dismissed', () => {
    const state = userAt('0.16.0', { tours: { run: 'skipped' }, known: ['share'] })
    expect(pendingReleases(state, REGISTRY, '0.18.0')).toEqual([])
  })

  it('offers nothing with the update switch off, and moves the version on', () => {
    const state = userAt('0.16.0', { offerTours: false })
    expect(pendingReleases(state, REGISTRY, '0.18.0')).toEqual([])
    expect(settledReleases(state, REGISTRY, '0.18.0')).toEqual({ version: '0.18.0', known: [] })
  })

  it('waits while a tour runs, a dialog is open or a done card is up', () => {
    const pending = ['run']
    expect(releaseOffer(pending, QUIET)).toEqual(['run'])
    expect(releaseOffer(pending, { ...QUIET, running: true })).toEqual([])
    expect(releaseOffer(pending, { ...QUIET, dialogOpen: true })).toEqual([])
    expect(releaseOffer(pending, { ...QUIET, doneCard: true })).toEqual([])
  })
})

describe('New on the Tours page', () => {
  it('marks a release tour not yet taken, Later included', () => {
    const tour = REGISTRY[1]
    expect(isNewTour(userAt('0.17.0'), tour, '0.17.0')).toBe(true)
    expect(isNewTour(userAt('0.17.0', { tours: { run: 'done' } }), tour, '0.17.0')).toBe(false)
    expect(isNewTour(userAt('0.17.0', { known: ['run'] }), tour, '0.17.0')).toBe(false)
  })

  it('never marks a tour that is not a release’s', () => {
    expect(isNewTour(userAt('0.16.0'), REGISTRY[0], '0.18.0')).toBe(false)
  })
})

describe('the Tours page rows', () => {
  it('lists the first tours, then each installed release newest first', () => {
    const state = userAt('0.18.0', { tours: { core: 'done', run: 'skipped' } })
    const { tours, releases } = tourRows(state, REGISTRY, '0.18.0')
    expect(tours.map((r) => [r.id, r.done, r.isNew, r.steps])).toEqual([['core', true, false, 1]])
    expect(releases.map((g) => [g.version, g.rows.map((r) => [r.id, r.isNew])])).toEqual([
      ['0.18.0', [['share', true]]],
      ['0.17.0', [['run', false]]]
    ])
  })

  it('gives the real registry three rows and no release', () => {
    const { tours, releases } = tourRows(userAt('0.16.0'), TOURS, '0.16.0')
    expect(tours.map((r) => r.id)).toEqual(['core', 'snippets', 'diagrams'])
    expect(releases).toEqual([])
  })
})
