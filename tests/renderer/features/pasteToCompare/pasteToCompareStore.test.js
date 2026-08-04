// Paste mode and copied files.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePasteToCompareStore } from '../../../../src/renderer/src/features/pasteToCompare'
import { useDiffStore } from '../../../../src/renderer/src/stores/diffStore'

const paste = () => usePasteToCompareStore()

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

const FILE = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })

// Copied files land exactly like dropped ones, confirm included.
describe('pasting copied files', () => {
  const AT = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })

  it('asks before it replaces a complete, unsaved comparison', async () => {
    const store = useDiffStore()
    store.left = AT('old-left.txt')
    store.right = AT('old-right.txt')
    window.api = {
      readClipboardFiles: async () => [AT('new-left.txt'), AT('new-right.txt')],
      readFile: async (path) => AT(path.split('/').pop())
    }

    await paste().request()
    // What matters is that it WAITS, holding both incoming files, and has not
    // touched the comparison on screen — not how the pending pair is carried.
    expect(store.pendingReplace).toHaveLength(2)
    expect(store.pendingReplace.map((f) => f.name)).toEqual(['new-left.txt', 'new-right.txt'])
    expect(store.left.name).toBe('old-left.txt')

    await store.confirmReplace()
    expect(store.left.name).toBe('new-left.txt')
    expect(store.right.name).toBe('new-right.txt')
  })

  it('replaces a SAVED comparison without asking, like a drop does', async () => {
    const store = useDiffStore()
    store.left = AT('old-left.txt')
    store.right = AT('old-right.txt')
    store.markSaved()
    window.api = {
      readClipboardFiles: async () => [AT('new-left.txt'), AT('new-right.txt')],
      readFile: async (path) => AT(path.split('/').pop())
    }

    await paste().request()
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('new-left.txt')
  })

  it('still fills the free side straight away when nothing would be lost', async () => {
    const store = useDiffStore()
    store.left = AT('kept.txt')
    window.api = {
      readClipboardFiles: async () => [AT('second.txt')],
      readFile: async (path) => AT(path.split('/').pop())
    }

    await paste().request()
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('kept.txt')
    expect(store.right.name).toBe('second.txt')
  })
})

// clipboard:readFiles already reads each file through the same path file:read
// uses, so re-reading by path put the "Large file — load anyway?" prompt in
// front of the user twice for one paste.
describe('pasteClipboardFiles', () => {
  it('uses the file objects it was handed instead of reading them again', async () => {
    const store = useDiffStore()
    const readFile = vi.fn(async (path) => ({ path, name: path.split('/').pop(), content: 'x' }))
    window.api = {
      readFile,
      readClipboardFiles: async () => [FILE('a.txt'), FILE('b.txt')]
    }

    expect(await paste().takeClipboardFiles()).toBe(true)
    expect(readFile).not.toHaveBeenCalled()
    expect(store.left.name).toBe('a.txt')
    expect(store.right.name).toBe('b.txt')
  })

  it('is false, and touches nothing, when the clipboard holds no files', async () => {
    const store = useDiffStore()
    window.api = { readClipboardFiles: async () => [] }
    expect(await paste().takeClipboardFiles()).toBe(false)
    expect(store.left).toBeNull()
  })

  it('drops entries the main process refused to read', async () => {
    const store = useDiffStore()
    window.api = {
      readClipboardFiles: async () => [null, FILE('only.txt')]
    }
    expect(await paste().takeClipboardFiles()).toBe(true)
    expect(store.left.name).toBe('only.txt')
    expect(store.right).toBeNull()
  })
})

describe('paste-to-compare — the gesture end to end', () => {
  it('paste-to-compare: confirming reads the clipboard into the first empty side', async () => {
    window.api = { readText: () => Promise.resolve('pasted body') }
    const store = useDiffStore()
    await paste().request()
    expect(paste().prompt).toBe('enter')
    await paste().confirmEnter()
    expect(store.mode).toBe('paste')
    expect(store.pasteLeft).toBe('pasted body')
    expect(paste().prompt).toBeNull()
  })
  it('paste-to-compare: fills the right side when the left already has content', async () => {
    window.api = { readText: () => Promise.resolve('second') }
    const store = useDiffStore()
    store.pasteLeft = 'first'
    await paste().confirmEnter()
    expect(store.pasteRight).toBe('second')
    expect(paste().prompt).toBeNull()
  })
  it('paste-to-compare: both sides full escalates to the overwrite confirm', async () => {
    window.api = { readText: () => Promise.resolve('third') }
    const store = useDiffStore()
    store.pasteLeft = 'first'
    store.pasteRight = 'second'
    await paste().confirmEnter()
    expect(paste().prompt).toBe('overwrite')
    expect(store.pasteLeft).toBe('first') // nothing clobbered yet
    paste().confirmOverwrite()
    expect(store.pasteLeft).toBe('third') // left replaced, right kept
    expect(store.pasteRight).toBe('second')
    expect(paste().prompt).toBeNull()
  })
  it('paste-to-compare: an empty clipboard notices and does not enter a prompt', async () => {
    window.api = { readText: () => Promise.resolve('   ') }
    const store = useDiffStore()
    await paste().confirmEnter()
    expect(paste().prompt).toBeNull()
    expect(store.notice).toContain('clipboard is empty')
  })
  it('paste-to-compare: with one file loaded, fills the EMPTY side and keeps the file', async () => {
    window.api = { readText: () => Promise.resolve('pasted body') }
    const store = useDiffStore()
    store.left = FILE('a.txt') // files mode, only the left loaded
    await paste().confirmEnter()
    expect(store.mode).toBe('files') // stays in files mode, no paste-mode detour
    expect(store.left.name).toBe('a.txt') // loaded file untouched
    expect(store.right).toEqual({ path: null, name: 'Right (pasted)', content: 'pasted body' })
    expect(store.ready).toBe(true) // immediate comparison
    expect(paste().prompt).toBeNull()
  })
  it('paste-to-compare: mirrors for a right-only file (pastes into left)', async () => {
    window.api = { readText: () => Promise.resolve('L') }
    const store = useDiffStore()
    store.right = FILE('b.txt')
    await paste().confirmEnter()
    expect(store.left).toEqual({ path: null, name: 'Left (pasted)', content: 'L' })
    expect(store.right.name).toBe('b.txt')
  })
  it('paste-to-compare: both files loaded confirms, then overwrite replaces the left file', async () => {
    window.api = { readText: () => Promise.resolve('new left') }
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    await paste().confirmEnter()
    expect(paste().prompt).toBe('overwrite')
    expect(store.left.name).toBe('a.txt') // nothing clobbered yet
    paste().confirmOverwrite()
    expect(store.left).toEqual({ path: null, name: 'Left (pasted)', content: 'new left' })
    expect(store.right.name).toBe('b.txt') // right kept
  })
  it('paste-to-compare: refuses (no prompt) when a spreadsheet is loaded', () => {
    const store = useDiffStore()
    store.left = { name: 'book.xlsx', kind: 'spreadsheet', sheets: [] }
    paste().request()
    expect(paste().prompt).toBeNull()
    expect(store.notice).toMatch(/spreadsheet/i)
  })
})
