// The list of conflicted files: what opens it, what closes it, and what happens
// when a row is answered. Rows carry no path — every call names an INDEX, and
// these tests are what hold that boundary.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConflictsStore } from '../../../../src/renderer/src/features/merge/conflictsStore'

const row = (name, state = 'open', tally = 1) => ({ name, dir: 'src', tally, state })

const WALK = {
  conflicts: [row('a.js'), row('b.js', 'done', 0), row('icon.png', 'blocked', 0)],
  at: 1
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.api = {
    conflictList: vi.fn(async () => WALK.conflicts),
    takeConflictSide: vi.fn(async () => ({ ok: true, wasCurrent: false })),
    openConflict: vi.fn(async () => ({ ok: true, fileName: 'a.js', content: 'x' })),
    endMergeWalk: vi.fn(async () => {})
  }
})

describe('begin', () => {
  it('takes the rows and the launch’s own position from the payload', () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    expect(conflicts.rows).toHaveLength(3)
    expect(conflicts.at).toBe(1)
    expect(conflicts.live).toBe(true)
    expect(conflicts.open).toBe(true)
  })

  // One file is not a list, and a dialog to choose from it is only in the way.
  it('does not open for a single conflicted file', () => {
    const conflicts = useConflictsStore()
    conflicts.begin({ conflicts: [row('only.js')], at: 0 })
    expect(conflicts.open).toBe(false)
    expect(conflicts.isWalk).toBe(false)
  })

  it('survives a payload with no list at all', () => {
    const conflicts = useConflictsStore()
    conflicts.begin({})
    expect(conflicts.rows).toEqual([])
    expect(conflicts.open).toBe(false)
  })

  it('counts what is left and what is done', () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    expect(conflicts.remaining).toBe(2)
    expect(conflicts.done).toBe(1)
  })
})

describe('showing it again', () => {
  // The bug this feature was asked to fix: dismissing the list used to be the
  // end of it. Closing it must leave the walk alive.
  it('closing the list leaves the session live, and show brings it back', () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    conflicts.dismiss()
    expect(conflicts.open).toBe(false)
    expect(conflicts.live).toBe(true)
    conflicts.show()
    expect(conflicts.open).toBe(true)
  })

  // git launches once per file, so a thirty-file walk used to put the same
  // modal in front of the reader thirty times.
  it('stays away for the rest of the walk once put away', () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    conflicts.dismiss()
    conflicts.begin(WALK)
    expect(conflicts.open).toBe(false)
  })

  // Stepping INTO a row is not putting the list away: the next launch, and the
  // save that returns here, must still show it.
  it('comes back after a row was opened from it', () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    conflicts.hide()
    expect(conflicts.open).toBe(false)
    conflicts.reveal()
    expect(conflicts.open).toBe(true)
  })

  it('offers itself again after a walk ends and another begins', async () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    conflicts.dismiss()
    await conflicts.end()
    conflicts.begin(WALK)
    expect(conflicts.open).toBe(true)
  })

  // git has stopped walking, so there is nothing to reconstruct.
  it('refuses to show anything once the walk has ended', async () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    await conflicts.end()
    conflicts.show()
    expect(conflicts.open).toBe(false)
    expect(conflicts.live).toBe(false)
    expect(window.api.endMergeWalk).toHaveBeenCalled()
  })
})

describe('take', () => {
  it('answers a row and re-reads the list from main', async () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    await conflicts.take(0, 'theirs')
    expect(window.api.takeConflictSide).toHaveBeenCalledWith(0, 'theirs')
    expect(window.api.conflictList).toHaveBeenCalled()
    expect(conflicts.error).toBe('')
  })

  // Answering the file the view has open releases that launch in main, so the
  // caller has to be told — otherwise the view sits over a merge that is over.
  it('reports when the row answered was the one being viewed', async () => {
    window.api.takeConflictSide = vi.fn(async () => ({ ok: true, wasCurrent: true }))
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    expect(await conflicts.take(1, 'ours')).toBe(true)
  })

  // A row can go stale between the dialog opening and the click. Main refuses
  // it; the reader has to see why rather than a row that silently did nothing.
  it('surfaces a row git no longer calls conflicted', async () => {
    window.api.takeConflictSide = vi.fn(async () => ({ ok: false, error: 'gone' }))
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    await conflicts.take(0, 'ours')
    expect(conflicts.error).toBe('gone')
  })

  it('refuses to run two at once', async () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    conflicts.busy = true
    await conflicts.take(0, 'ours')
    expect(window.api.takeConflictSide).not.toHaveBeenCalled()
  })
})

describe('payloadAt', () => {
  it('hands back what the three-way view needs', async () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    expect(await conflicts.payloadAt(0)).toMatchObject({ fileName: 'a.js' })
    expect(window.api.openConflict).toHaveBeenCalledWith(0)
  })

  it('says so rather than opening a file that cannot be read as text', async () => {
    window.api.openConflict = vi.fn(async () => ({ ok: false, error: 'blocked' }))
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    expect(await conflicts.payloadAt(2)).toBe(null)
    expect(conflicts.error).toBe('blocked')
  })
})

describe('select', () => {
  it('moves to a row that exists and ignores one that does not', () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    conflicts.select(2)
    expect(conflicts.at).toBe(2)
    for (const bad of [-1, 3, 99]) {
      conflicts.select(bad)
      expect(conflicts.at).toBe(2)
    }
  })
})

describe('markDone', () => {
  it('settles a row without waiting for main to be asked again', () => {
    const conflicts = useConflictsStore()
    conflicts.begin(WALK)
    conflicts.markDone(0)
    expect(conflicts.rows[0]).toMatchObject({ state: 'done', tally: 0 })
    expect(conflicts.markDone(99)).toBeUndefined()
  })
})
