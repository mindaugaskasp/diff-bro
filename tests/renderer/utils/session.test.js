import { describe, expect, it } from 'vitest'
import {
  EMPTY_ENVELOPE,
  MAX_SESSION_BYTES,
  MAX_TAB_BYTES,
  SESSION_VERSION,
  packSession,
  readEnvelope,
  readSession,
  readSnapshot
} from '../../../src/renderer/src/utils/session'
import { MAX_TABS, blankSnapshot, isHalfLoaded } from '../../../src/renderer/src/utils/tabs'

const side = (name, content = 'x') => ({ path: `/tmp/${name}`, name, content })

const snapshot = (over = {}) => ({ ...blankSnapshot(), ...over })

const tab = (id, over = {}) => ({
  id,
  title: id,
  customTitle: '',
  entryId: null,
  diffSaved: false,
  snapshot: snapshot({ left: side('a.txt'), right: side('b.txt') }),
  ...over
})

// A round trip through the exact string that goes on disk — packing a session
// nothing can read back would be a silent loss.
const roundTrip = (...args) => readSession(JSON.stringify(packSession(...args)))

describe('packSession', () => {
  it('keeps every non-blank tab and marks the active one', () => {
    const tabs = [tab('tab-1'), tab('tab-2')]
    const packed = packSession(tabs, 'tab-2')
    expect(packed.version).toBe(SESSION_VERSION)
    expect(packed.tabs).toHaveLength(2)
    expect(packed.tabs.map((t) => t.active)).toEqual([false, true])
  })

  it('is null when nothing is open, so a cleared window restores clean', () => {
    expect(packSession([tab('tab-1', { snapshot: blankSnapshot() })], 'tab-1')).toBeNull()
    expect(packSession([], null)).toBeNull()
    expect(packSession(undefined, null)).toBeNull()
  })

  // The active tab's own snapshot is only refreshed when tabs switch, so
  // packing it would store the comparison as it was BEFORE the current edits.
  it('packs the active tab from the live document, not its stale snapshot', () => {
    const tabs = [
      tab('tab-1', { snapshot: snapshot({ left: side('old.txt'), right: side('b.txt') }) })
    ]
    const live = {
      snapshot: snapshot({ left: side('new.txt'), right: side('b.txt') }),
      diffSaved: true
    }
    const [packed] = packSession(tabs, 'tab-1', live).tabs
    expect(packed.snapshot.left.name).toBe('new.txt')
    expect(packed.diffSaved).toBe(true)
  })

  it('drops the active tab when the live document is empty', () => {
    const tabs = [tab('tab-1'), tab('tab-2')]
    const live = { snapshot: blankSnapshot(), diffSaved: false }
    const packed = packSession(tabs, 'tab-2', live)
    expect(packed.tabs).toHaveLength(1)
    expect(packed.tabs[0].active).toBe(false)
  })

  it('keeps the name the reader typed', () => {
    const tabs = [tab('tab-1', { customTitle: 'prod vs staging', entryId: 'entry-9' })]
    const [packed] = packSession(tabs, 'tab-1').tabs
    expect(packed.customTitle).toBe('prod vs staging')
    expect(packed.entryId).toBe('entry-9')
  })

  it('leaves out a tab too big to store, and keeps the rest', () => {
    const huge = tab('tab-1', {
      snapshot: snapshot({
        left: side('huge.txt', 'x'.repeat(MAX_TAB_BYTES + 1)),
        right: side('b.txt')
      })
    })
    const packed = packSession([huge, tab('tab-2')], 'tab-2')
    expect(packed.tabs).toHaveLength(1)
    expect(packed.tabs[0].snapshot.left.name).toBe('a.txt')
  })

  it('stops at the session budget rather than growing without bound', () => {
    const big = (id) =>
      tab(id, {
        snapshot: snapshot({ left: side(`${id}.txt`, 'x'.repeat(1_800_000)), right: side('b.txt') })
      })
    const packed = packSession([big('t1'), big('t2'), big('t3'), big('t4')], 't1')
    expect(packed.tabs.length).toBeLessThan(4)
    expect(JSON.stringify(packed).length).toBeLessThanOrEqual(MAX_SESSION_BYTES)
  })
})

describe('readSession', () => {
  it('reads back what packSession wrote', () => {
    const tabs = [tab('tab-1'), tab('tab-2', { customTitle: 'second' })]
    const session = roundTrip(tabs, 'tab-2')
    expect(session.tabs).toHaveLength(2)
    expect(session.tabs[1]).toMatchObject({ customTitle: 'second', active: true })
    expect(session.tabs[0].snapshot.left.name).toBe('a.txt')
  })

  it('round-trips a paste-mode comparison, which exists nowhere else', () => {
    const pasted = tab('tab-1', {
      snapshot: snapshot({ mode: 'paste', pasteLeft: 'one', pasteRight: 'two' })
    })
    const [restored] = roundTrip([pasted], 'tab-1').tabs
    expect(restored.snapshot.mode).toBe('paste')
    expect(restored.snapshot.pasteLeft).toBe('one')
    expect(restored.snapshot.pasteRight).toBe('two')
  })

  it('round-trips a spreadsheet side', () => {
    const sheets = [{ name: 'Sheet1', rows: [['a', 1]] }]
    const grid = tab('tab-1', {
      snapshot: snapshot({
        left: { path: '/tmp/a.xlsx', name: 'a.xlsx', kind: 'spreadsheet', sheets },
        right: side('b.xlsx')
      })
    })
    const [restored] = roundTrip([grid], 'tab-1').tabs
    expect(restored.snapshot.left).toMatchObject({ kind: 'spreadsheet', sheets })
  })

  it('refuses junk, a foreign version and a shape that is not a session', () => {
    expect(readSession('not json')).toBeNull()
    expect(readSession(undefined)).toBeNull()
    expect(readSession(JSON.stringify({ version: 99, tabs: [tab('tab-1')] }))).toBeNull()
    expect(readSession(JSON.stringify({ version: SESSION_VERSION, tabs: 'nope' }))).toBeNull()
    expect(readSession(JSON.stringify({ version: SESSION_VERSION, tabs: [] }))).toBeNull()
  })

  it('drops tabs that carry no comparison instead of restoring empty ones', () => {
    const stored = {
      version: SESSION_VERSION,
      tabs: [{ snapshot: blankSnapshot() }, null, 'nope', { snapshot: { left: side('a.txt') } }]
    }
    const session = readSession(JSON.stringify(stored))
    expect(session.tabs).toHaveLength(1)
    expect(session.tabs[0].snapshot.left.name).toBe('a.txt')
  })

  it('never restores more tabs than the window can hold', () => {
    const stored = {
      version: SESSION_VERSION,
      tabs: Array.from({ length: MAX_TABS + 3 }, (_, i) => ({
        snapshot: { left: side(`f${i}.txt`) }
      }))
    }
    expect(readSession(JSON.stringify(stored)).tabs).toHaveLength(MAX_TABS)
  })
})

describe('readSnapshot', () => {
  it('coerces a hand-edited file back into the shape the store restores', () => {
    const snap = readSnapshot({
      mode: 'sideways',
      left: { name: 42, content: 'a', path: null, junk: 'dropped' },
      right: 'not an object',
      pasteLeft: 7,
      renderSideBySide: false,
      ignoreTrimWhitespace: 'yes'
    })
    expect(snap.mode).toBe('files')
    expect(snap.left).toEqual({ path: null, name: 'Untitled', content: 'a' })
    expect(snap.right).toBeNull()
    expect(snap.pasteLeft).toBe('')
    expect(snap.renderSideBySide).toBe(false)
    // Only a real `true` turns it on — a truthy string must not.
    expect(snap.ignoreTrimWhitespace).toBe(false)
  })

  it('is null for anything that is not an object', () => {
    expect(readSnapshot(null)).toBeNull()
    expect(readSnapshot('{}')).toBeNull()
  })

  it('drops a side with neither text nor sheets', () => {
    expect(readSnapshot({ left: { name: 'ghost.txt' } }).left).toBeNull()
  })
})

describe('readEnvelope', () => {
  it('accepts a sealed box and refuses everything else', () => {
    expect(readEnvelope(JSON.stringify({ iv: 'aa', data: 'bb' }))).toEqual({ iv: 'aa', data: 'bb' })
    expect(readEnvelope(EMPTY_ENVELOPE)).toBeNull()
    expect(readEnvelope('')).toBeNull()
    expect(readEnvelope(null)).toBeNull()
    expect(readEnvelope(JSON.stringify({ iv: 'aa' }))).toBeNull()
    expect(readEnvelope(JSON.stringify({ iv: 1, data: 2 }))).toBeNull()
  })
})

// The session has a byte budget, and tabs that do not fit are left out. With a
// ceiling of six that was rare; at sixteen it is routine, so the count has to
// come back rather than the tabs going quietly.
describe('what the session could not keep', () => {
  const heavy = (id, chars) => ({
    id,
    snapshot: {
      ...blankSnapshot(),
      left: { name: `${id}.txt`, content: 'x'.repeat(chars) },
      right: { name: 'b.txt', content: 'y' }
    },
    diffSaved: true
  })

  it('reports nothing dropped when everything fits', () => {
    expect(packSession([tab('tab-1'), tab('tab-2')], 'tab-1').dropped).toBe(0)
  })

  it('counts a tab too big for the whole session', () => {
    const packed = packSession([heavy('a', 10), heavy('b', MAX_SESSION_BYTES + 10)], 'a')
    expect(packed.tabs).toHaveLength(1)
    expect(packed.dropped).toBe(1)
  })

  it('counts every tab that ran past the budget, not just the first', () => {
    const big = Math.floor(MAX_TAB_BYTES * 0.9)
    const many = Array.from({ length: 8 }, (_, i) => heavy(`t${i}`, big))
    const packed = packSession(many, 't0')
    expect(packed.tabs.length).toBeLessThan(8)
    expect(packed.dropped).toBe(8 - packed.tabs.length)
  })

  // A blank tab is not "dropped" — there was never anything in it to lose.
  it('does not count blank tabs as losses', () => {
    const packed = packSession([tab('tab-1'), { id: 'blank', snapshot: blankSnapshot() }], 'tab-1')
    expect(packed.dropped).toBe(0)
  })
})

describe('isHalfLoaded', () => {
  const tab = (snapshot) => ({ snapshot })

  it('is true for exactly one side', () => {
    expect(isHalfLoaded(tab({ left: { name: 'a' }, right: null }))).toBe(true)
    expect(isHalfLoaded(tab({ left: null, right: { name: 'b' } }))).toBe(true)
  })

  it('is false for a real comparison and for an empty tab', () => {
    expect(isHalfLoaded(tab({ left: { name: 'a' }, right: { name: 'b' } }))).toBe(false)
    expect(isHalfLoaded(tab({ left: null, right: null }))).toBe(false)
    expect(isHalfLoaded(undefined)).toBe(false)
  })

  // It is about the FILE SLOTS, and paste text does not make a tab half-loaded
  // on its own. The old assertion passed with `pasteLeft` deleted, because both
  // sides were already null — it guarded nothing.
  it('is about the file slots, not the paste buffers', () => {
    expect(isHalfLoaded(tab({ left: null, right: null, pasteLeft: 'typed' }))).toBe(false)
    expect(isHalfLoaded(tab({ left: null, right: null, pasteLeft: '', pasteRight: 'typed' }))).toBe(
      false
    )
    // …and one filled slot IS half-loaded however much has been typed beside it.
    expect(isHalfLoaded(tab({ left: { name: 'a' }, right: null, pasteLeft: 'typed' }))).toBe(true)
  })
})

// The half-loaded reset happens on the way OUT, so what is written is what
// comes back. Clearing it on the way in made the writer produce tabs the reader
// discarded, and it took the user's own typing with the drop they abandoned.
describe('packSession — a half-loaded tab is reset, not blanked', () => {
  const halfWithPaste = (over = {}) =>
    tab('tab-1', {
      snapshot: snapshot({
        left: side('a.txt'),
        right: null,
        mode: 'paste',
        pasteLeft: 'the draft I was writing',
        renderSideBySide: false,
        ignoreTrimWhitespace: true,
        ...over
      })
    })

  it('keeps the paste work, the mode and the view toggles', () => {
    const packed = packSession([halfWithPaste()], 'tab-1')
    const s = packed.tabs[0].snapshot
    expect(s.pasteLeft).toBe('the draft I was writing')
    expect(s.mode).toBe('paste')
    expect(s.renderSideBySide).toBe(false)
    expect(s.ignoreTrimWhitespace).toBe(true)
  })

  it('drops the one file slot that was filled', () => {
    const s = packSession([halfWithPaste()], 'tab-1').tabs[0].snapshot
    expect(s.left).toBe(null)
    expect(s.right).toBe(null)
  })

  it('leaves a half-loaded tab with nothing else in it out of the session', () => {
    const bare = tab('tab-1', { snapshot: snapshot({ left: side('a.txt'), right: null }) })
    expect(packSession([bare], 'tab-1')).toBe(null)
  })

  it('does not restore a row of blanks when every tab was half-loaded', () => {
    const bare = (id) => tab(id, { snapshot: snapshot({ left: side(`${id}.txt`) }) })
    const packed = packSession([bare('a'), bare('b'), bare('c')], 'a')
    expect(readSession(JSON.stringify(packed))).toBe(null)
  })

  it('does not count a reset tab as a dropped comparison', () => {
    const bare = tab('tab-1', { snapshot: snapshot({ left: side('a.txt') }) })
    const packed = packSession([bare, tab('tab-2')], 'tab-2')
    expect(packed.dropped).toBe(0)
  })

  it('leaves a tab that still holds work wearing its own name', () => {
    const named = { ...halfWithPaste(), customTitle: 'prod vs staging', entryId: 'entry-1' }
    const packed = packSession([named], 'tab-1')
    expect(packed.tabs[0].customTitle).toBe('prod vs staging')
  })
})

// A stored session says what the reader chose; a session that predates the
// choice must stay SILENT about it, so the store can take the view from the
// files rather than being told "text" by a field that was never written.
describe('readSession — the view a snapshot never recorded', () => {
  const withView = (view) => {
    const raw = JSON.parse(JSON.stringify(packSession([tab('tab-1')], 'tab-1')))
    if (view === undefined) delete raw.tabs[0].snapshot.semanticView
    else raw.tabs[0].snapshot.semanticView = view
    return readSession(JSON.stringify(raw)).tabs[0].snapshot.semanticView
  }

  it('leaves an unrecorded view undefined, not false', () => {
    expect(withView(undefined)).toBeUndefined()
  })

  it('keeps a recorded view, either way', () => {
    expect(withView(true)).toBe(true)
    expect(withView(false)).toBe(false)
  })

  it('still refuses a value that is not a boolean', () => {
    expect(withView('yes')).toBeUndefined()
  })
})
