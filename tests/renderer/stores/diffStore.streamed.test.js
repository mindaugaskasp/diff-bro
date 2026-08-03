// Comparisons too large to hold in memory.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

const FILE = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })

const BIG = (name) => ({ path: `/big/${name}`, name, size: 60 * 1024 * 1024, kind: 'streamed' })

function loadStreamed(store) {
  store.receive('left', BIG('left.log'))
  store.receive('right', BIG('right.log'))
  return store
}

describe('diffStore — streamed comparisons', () => {
  it('accepts a streamed descriptor into a slot', () => {
    const store = loadStreamed(useDiffStore())
    expect(store.ready).toBe(true)
    expect(store.notice).toBeNull()
    expect(store.leftComparable).toEqual({
      kind: 'streamed',
      path: '/big/left.log',
      name: 'left.log',
      size: 60 * 1024 * 1024
    })
  })

  it('routes to the streamed viewer', () => {
    expect(loadStreamed(useDiffStore()).comparableKind).toBe('streamed')
    expect(loadStreamed(useDiffStore()).isStreamed).toBe(true)
  })

  // One side too large makes the WHOLE comparison streamed — there is no text
  // for the other side to be diffed against in an editor model.
  it('is streamed when only the RIGHT side is too large', () => {
    const store = useDiffStore()
    store.receive('left', FILE('small.txt'))
    store.receive('right', BIG('huge.log'))
    expect(store.comparableKind).toBe('streamed')
  })

  it('is streamed when only the LEFT side is too large', () => {
    const store = useDiffStore()
    store.receive('left', BIG('huge.log'))
    store.receive('right', FILE('small.txt'))
    expect(store.comparableKind).toBe('streamed')
  })

  it('leaves an ordinary comparison on the text viewer', () => {
    const store = useDiffStore()
    store.receive('left', FILE('a.txt'))
    store.receive('right', FILE('b.txt'))
    expect(store.comparableKind).toBe('text')
    expect(store.isStreamed).toBe(false)
  })

  it('refuses to save, which would keep a copy of both files', () => {
    const store = loadStreamed(useDiffStore())
    expect(store.canSave).toBe(false)
  })

  it('refuses to share, since sharing goes through saving', () => {
    const store = loadStreamed(useDiffStore())
    store.shareCurrent()
    expect(store.showSaveDialog).toBe(false)
    expect(store.notice).toBeTruthy()
  })

  it('refuses to copy a patch, naming the reason', async () => {
    const store = loadStreamed(useDiffStore())
    let copied = false
    window.api.copyText = async () => {
      copied = true
      return { ok: true }
    }
    await store.copyDiff()
    expect(copied).toBe(false)
    expect(store.notice).toContain('Too large to copy as a patch')
  })

  it('refuses an HTML export, naming the reason', async () => {
    const store = loadStreamed(useDiffStore())
    let exported = false
    window.api.exportDiffFile = async () => {
      exported = true
      return { ok: true }
    }
    await store.exportDiff()
    expect(exported).toBe(false)
    expect(store.notice).toContain('Too large to export')
  })

  // Deliberately still allowed: the streamed viewer registers a scroller, so a
  // picture of what is on screen is a real picture.
  it('still allows an image export', () => {
    expect(loadStreamed(useDiffStore()).canExportImage).toBe(true)
  })

  it('refuses a streamed file dropped into a paste side', () => {
    const store = useDiffStore()
    store.receivePasteFile('left', BIG('huge.log'))
    expect(store.pasteLeftFile).toBeNull()
    expect(store.notice).toContain('too large to paste against')
  })

  it('knows a streamed pair needs two files on disk', () => {
    const store = loadStreamed(useDiffStore())
    expect(store.streamedPairReady).toBe(true)
    store.right = { path: null, name: 'Right (pasted)', content: 'typed' }
    expect(store.streamedPairReady).toBe(false)
  })

  // The streamed viewer opens a session from BOTH paths. A mixed pair reads as
  // streamed, but the small side's comparable is an ordinary text one carrying
  // no path — so the paths must come from the loaded files, not the comparables.
  it('exposes both paths for a mixed streamed/ordinary pair', () => {
    const store = useDiffStore()
    store.receive('left', BIG('huge.log'))
    store.receive('right', FILE('small.txt'))
    expect(store.isStreamed).toBe(true)
    expect(store.rightComparable.path).toBeUndefined()
    expect(store.streamedPairReady).toBe(true)
    expect([store.left.path, store.right.path]).toEqual(['/big/huge.log', '/tmp/small.txt'])
  })

  it('is not pair-ready when a streamed side sits opposite pasted text', () => {
    const store = useDiffStore()
    store.receive('left', BIG('huge.log'))
    store.right = { path: null, name: 'Right (pasted)', content: 'typed' }
    expect(store.isStreamed).toBe(true)
    expect(store.streamedPairReady).toBe(false)
  })

  it('keeps saving available once the streamed side is cleared', () => {
    const store = loadStreamed(useDiffStore())
    expect(store.canSave).toBe(false)
    store.receive('left', FILE('a.txt'))
    store.receive('right', FILE('b.txt'))
    expect(store.canSave).toBe(true)
  })
})
