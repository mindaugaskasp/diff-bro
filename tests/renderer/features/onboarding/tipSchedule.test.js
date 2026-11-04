import { describe, expect, it } from 'vitest'
import {
  broughtBackTips,
  isTipDue,
  isTipQuiet,
  knewTip,
  localDay,
  presentedTips,
  readTips,
  tipQueue
} from '../../../../src/renderer/src/features/onboarding/tipSchedule'
import { TIPS } from '../../../../src/renderer/src/features/onboarding/tips'

const DEFAULT = { on: true, known: [], seen: [], shownOn: null, since: null }
const tip = (id, extra = {}) => ({ id, titleKey: 't', bodyKey: 'b', ...extra })
const QUIET = {
  running: false,
  doneCard: false,
  releaseCard: false,
  dialogOpen: false,
  offering: false,
  firstDay: false
}

describe('localDay', () => {
  it('is the local calendar date, not the UTC one', () => {
    expect(localDay(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04')
    expect(localDay(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })
})

describe('readTips', () => {
  it('starts on, with nothing known or seen', () => {
    expect(readTips(null)).toEqual(DEFAULT)
  })

  it('marks the day a fresh install began', () => {
    expect(readTips(null, { since: '2026-11-04' }).since).toBe('2026-11-04')
  })

  it('keeps what is stored, and drops anything malformed', () => {
    const raw = { on: false, known: ['a', 3], seen: ['b'], shownOn: '2026-11-03', since: 7 }
    expect(readTips(raw)).toEqual({
      on: false,
      known: ['a'],
      seen: ['b'],
      shownOn: '2026-11-03',
      since: null
    })
  })
})

describe('isTipDue', () => {
  it('is due on the first front of a new local date', () => {
    expect(isTipDue({ ...DEFAULT, shownOn: '2026-11-03' }, '2026-11-04')).toBe(true)
    expect(isTipDue(DEFAULT, '2026-11-04')).toBe(true)
  })

  it('is not due again the same day', () => {
    expect(isTipDue({ ...DEFAULT, shownOn: '2026-11-04' }, '2026-11-04')).toBe(false)
  })

  it('is never due with tips off', () => {
    expect(isTipDue({ ...DEFAULT, on: false }, '2026-11-04')).toBe(false)
  })
})

describe('isTipQuiet', () => {
  it('is quiet with nothing else up', () => {
    expect(isTipQuiet(QUIET)).toBe(true)
  })

  it.each(['running', 'doneCard', 'releaseCard', 'dialogOpen'])('waits while %s', (busy) => {
    expect(isTipQuiet({ ...QUIET, [busy]: true })).toBe(false)
  })

  it('waits on a fresh install’s first day while the core tour is offered', () => {
    expect(isTipQuiet({ ...QUIET, offering: true, firstDay: true })).toBe(false)
    expect(isTipQuiet({ ...QUIET, offering: false, firstDay: true })).toBe(true)
  })

  it('does not wait for the offer after the first day', () => {
    expect(isTipQuiet({ ...QUIET, offering: true, firstDay: false })).toBe(true)
  })
})

describe('tipQueue', () => {
  const registry = [tip('a'), tip('b'), tip('c')]

  it('is the registry order', () => {
    expect(tipQueue(DEFAULT, registry, '0.16.0')).toEqual(['a', 'b', 'c'])
  })

  it('drops what was seen or known', () => {
    expect(tipQueue({ ...DEFAULT, seen: ['a'], known: ['c'] }, registry, '0.16.0')).toEqual(['b'])
  })

  it('is empty once every tip was seen or known', () => {
    expect(tipQueue({ ...DEFAULT, seen: ['a', 'b'], known: ['c'] }, registry, '0.16.0')).toEqual([])
  })

  it('puts the running release’s tips first, newest first', () => {
    const withReleases = [
      ...registry,
      tip('r16', { release: true, introducedIn: '0.16.0' }),
      tip('r17', { release: true, introducedIn: '0.17.0' }),
      tip('r17b', { release: true, introducedIn: '0.17.2' })
    ]
    expect(tipQueue(DEFAULT, withReleases, '0.17.3')).toEqual(['r17b', 'r17', 'a', 'b', 'c', 'r16'])
  })

  it('leaves out a release tip the app has not reached', () => {
    const ahead = [...registry, tip('r18', { release: true, introducedIn: '0.18.0' })]
    expect(tipQueue(DEFAULT, ahead, '0.17.0')).toEqual(['a', 'b', 'c'])
  })
})

describe('the tip’s outcomes', () => {
  it('a shown tip is seen and marks the day', () => {
    expect(presentedTips(DEFAULT, 'a', '2026-11-04')).toMatchObject({
      seen: ['a'],
      shownOn: '2026-11-04'
    })
  })

  it('Knew this already keeps the tip in the known list', () => {
    const shown = presentedTips(DEFAULT, 'a', '2026-11-04')
    expect(knewTip(shown, 'a').known).toEqual(['a'])
    expect(knewTip(knewTip(shown, 'a'), 'a').known).toEqual(['a'])
  })

  it('Bring back empties the known list and returns those tips to the queue', () => {
    const state = { ...DEFAULT, seen: ['a', 'b'], known: ['b'] }
    const back = broughtBackTips(state)
    expect(back).toMatchObject({ known: [], seen: ['a'] })
    expect(tipQueue(back, [tip('a'), tip('b')], '0.16.0')).toEqual(['b'])
  })
})

describe('the v1 tips', () => {
  it('are the five picked on #114, in order', () => {
    expect(TIPS.map((t) => t.id)).toEqual([
      'hash-scope-search',
      'snippet-colour',
      'name-placeholders',
      'quick-look-tools',
      'mermaid-repair'
    ])
  })

  it('each has its copy, and a Show me names a target and a note', () => {
    for (const t of TIPS) {
      expect(t.titleKey).toMatch(/^tips\./)
      expect(t.bodyKey).toMatch(/^tips\./)
      if (t.show)
        expect(t.show).toMatchObject({
          target: expect.any(String),
          noteKey: expect.stringMatching(/^tips\./)
        })
    }
    expect(TIPS.find((t) => t.id === 'quick-look-tools').show).toBeUndefined()
  })
})
