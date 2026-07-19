import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../src/renderer/src/stores/diffStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

const FILE = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })

describe('diffStore', () => {
  it('is ready only when both sides are loaded', () => {
    const store = useDiffStore()
    expect(store.ready).toBe(false)
    store.left = FILE('a.txt')
    expect(store.ready).toBe(false)
    store.right = FILE('b.txt')
    expect(store.ready).toBe(true)
  })

  it('canSave follows the active mode', () => {
    const store = useDiffStore()
    expect(store.canSave).toBe(false)
    store.mode = 'paste'
    store.pasteLeft = 'something'
    expect(store.canSave).toBe(true)
    store.mode = 'files'
    expect(store.canSave).toBe(false) // files mode needs both files
  })

  it('rejects binary files with a notice and leaves the slot unchanged', () => {
    const store = useDiffStore()
    store.receive('left', { error: 'binary', name: 'blob.bin' })
    expect(store.left).toBeNull()
    expect(store.notice).toContain('blob.bin')
  })

  it('swap exchanges the two sides', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.swap()
    expect(store.left.name).toBe('b.txt')
    expect(store.right.name).toBe('a.txt')
  })

  it('snapshot/restore roundtrips the full comparison state', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'L'
    store.pasteRight = 'R'
    store.renderSideBySide = false
    store.ignoreTrimWhitespace = true
    const snap = store.snapshot()

    store.$reset()
    store.restore(snap)
    expect(store.mode).toBe('paste')
    expect(store.pasteLeft).toBe('L')
    expect(store.pasteRight).toBe('R')
    expect(store.renderSideBySide).toBe(false)
    expect(store.ignoreTrimWhitespace).toBe(true)
  })

  it('comparePasted promotes pasted text into the diff view', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'old'
    store.pasteRight = 'new'
    store.comparePasted()
    expect(store.mode).toBe('files')
    expect(store.left.content).toBe('old')
    expect(store.right.content).toBe('new')
    expect(store.ready).toBe(true)
  })

  it('routes menu actions: toggle-split flips the view option', () => {
    const store = useDiffStore()
    const before = store.renderSideBySide
    store.handleMenuAction('toggle-split')
    expect(store.renderSideBySide).toBe(!before)
  })

  it('only opens the save dialog when there is something to save', () => {
    const store = useDiffStore()
    store.handleMenuAction('save')
    expect(store.showSaveDialog).toBe(false)
    store.mode = 'paste'
    store.pasteLeft = 'x'
    store.handleMenuAction('save')
    expect(store.showSaveDialog).toBe(true)
  })

  it('shareCurrent explains itself instead of opening dialogs on an empty app', () => {
    const store = useDiffStore()
    store.shareCurrent()
    expect(store.showSaveDialog).toBe(false)
    expect(store.saveThenShare).toBe(false)
    expect(store.notice).toContain('Nothing to share')
  })

  it('shareCurrent chains save → share when a diff is present', () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'x'
    store.shareCurrent()
    expect(store.showSaveDialog).toBe(true)
    expect(store.saveThenShare).toBe(true)
  })

  it('toggleTheme flips the theme, persists it, and stamps the document', () => {
    const store = useDiffStore()
    expect(store.theme).toBe('dark')
    store.toggleTheme()
    expect(store.theme).toBe('light')
    expect(localStorage.getItem('diffbro.theme')).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    store.toggleTheme()
    expect(store.theme).toBe('dark')
  })
})
