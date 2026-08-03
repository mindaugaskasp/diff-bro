// Paste mode and copied files.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'

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

    await store.requestPasteFromClipboard()
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

    await store.requestPasteFromClipboard()
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

    await store.requestPasteFromClipboard()
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

    expect(await store.pasteClipboardFiles()).toBe(true)
    expect(readFile).not.toHaveBeenCalled()
    expect(store.left.name).toBe('a.txt')
    expect(store.right.name).toBe('b.txt')
  })

  it('is false, and touches nothing, when the clipboard holds no files', async () => {
    const store = useDiffStore()
    window.api = { readClipboardFiles: async () => [] }
    expect(await store.pasteClipboardFiles()).toBe(false)
    expect(store.left).toBeNull()
  })

  it('drops entries the main process refused to read', async () => {
    const store = useDiffStore()
    window.api = {
      readClipboardFiles: async () => [null, FILE('only.txt')]
    }
    expect(await store.pasteClipboardFiles()).toBe(true)
    expect(store.left.name).toBe('only.txt')
    expect(store.right).toBeNull()
  })
})
