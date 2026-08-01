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
import { MAX_TABS, blankSnapshot } from '../../../src/renderer/src/utils/tabs'

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
    const tabs = [tab('tab-1', { snapshot: snapshot({ left: side('old.txt') }) })]
    const live = { snapshot: snapshot({ left: side('new.txt') }), diffSaved: true }
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
      snapshot: snapshot({ left: side('huge.txt', 'x'.repeat(MAX_TAB_BYTES + 1)) })
    })
    const packed = packSession([huge, tab('tab-2')], 'tab-2')
    expect(packed.tabs).toHaveLength(1)
    expect(packed.tabs[0].snapshot.left.name).toBe('a.txt')
  })

  it('stops at the session budget rather than growing without bound', () => {
    const big = (id) =>
      tab(id, { snapshot: snapshot({ left: side(`${id}.txt`, 'x'.repeat(1_800_000)) }) })
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
