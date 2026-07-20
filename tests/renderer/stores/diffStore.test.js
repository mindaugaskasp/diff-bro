import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'

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

  it('dropFiles loads two dropped files into left and right', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({
      path,
      name: path.split('/').pop(),
      content: `c:${path}`
    })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    expect(store.left.name).toBe('a.txt')
    expect(store.right.name).toBe('b.txt')
    expect(store.ready).toBe(true)
  })

  it('dropFiles with one file fills the first empty side (left, then right)', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/first.txt'])
    expect(store.left.name).toBe('first.txt')
    expect(store.right).toBeNull()
    await store.dropFiles(['/tmp/second.txt'])
    expect(store.right.name).toBe('second.txt')
  })

  it('dropFiles targets a specific slot when a side is given', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/only.txt'], 'right')
    expect(store.right.name).toBe('only.txt')
    expect(store.left).toBeNull()
  })

  it('dropFiles: a third single file prompts before replacing a complete diff', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    expect(store.ready).toBe(true)
    await store.dropFiles(['/tmp/c.txt']) // third file -> confirmation, not silent replace
    expect(store.pendingReplace).toEqual(['/tmp/c.txt'])
    expect(store.left.name).toBe('a.txt') // still the old diff until confirmed
    await store.confirmReplace()
    expect(store.left.name).toBe('c.txt')
    expect(store.right).toBeNull()
  })

  it('dropFiles: dropping two files onto a complete diff also prompts, then fills both', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    await store.dropFiles(['/tmp/c.txt', '/tmp/d.txt'])
    expect(store.pendingReplace).toEqual(['/tmp/c.txt', '/tmp/d.txt'])
    expect(store.left.name).toBe('a.txt')
    await store.confirmReplace()
    expect(store.left.name).toBe('c.txt')
    expect(store.right.name).toBe('d.txt')
  })

  it('dropFiles onto a specific slot replaces just that side without prompting', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    await store.dropFiles(['/tmp/new.txt'], 'left')
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('new.txt')
    expect(store.right.name).toBe('b.txt')
  })

  it('cancelReplace drops the pending replacement, keeping the current diff', async () => {
    const store = useDiffStore()
    window.api.readFile = async (path) => ({ path, name: path.split('/').pop(), content: 'x' })
    await store.dropFiles(['/tmp/a.txt', '/tmp/b.txt'])
    await store.dropFiles(['/tmp/c.txt'])
    store.cancelReplace()
    expect(store.pendingReplace).toBeNull()
    expect(store.left.name).toBe('a.txt')
    expect(store.right.name).toBe('b.txt')
  })

  it('clear wipes loaded files and paste-mode text', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.pasteLeft = 'lingering left'
    store.pasteRight = 'lingering right'
    store.clear()
    expect(store.left).toBeNull()
    expect(store.right).toBeNull()
    expect(store.pasteLeft).toBe('')
    expect(store.pasteRight).toBe('')
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

  it('routes menu actions: tools-base64, tools-json, tools-xml, tools-crypt open their dialogs', () => {
    const store = useDiffStore()
    store.handleMenuAction('tools-base64')
    expect(store.showBase64Dialog).toBe(true)
    store.handleMenuAction('tools-json')
    expect(store.showJsonToolDialog).toBe(true)
    store.handleMenuAction('tools-xml')
    expect(store.showXmlToolDialog).toBe(true)
    store.handleMenuAction('tools-crypt')
    expect(store.showCryptDialog).toBe(true)
  })

  it('surfaces a format hint for JSON/XML-shaped content and none for plain text', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    store.right = { path: '/tmp/b.txt', name: 'b.txt', content: 'just some text' }
    expect(store.leftFormatHint).toEqual({ kind: 'json', valid: true })
    expect(store.rightFormatHint).toBeNull()
  })

  it('has no format hint for content that is already pretty-printed', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{\n  "a": 1\n}' }
    expect(store.leftFormatHint).toBeNull()
  })

  it('surfaces an invalid-format hint (no Format action) for malformed JSON', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a": 1,}' }
    expect(store.leftFormatHint.kind).toBe('json')
    expect(store.leftFormatHint.valid).toBe(false)
  })

  it('formatSide pretty-prints the content in place', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    store.formatSide('left')
    expect(store.left.content).toBe('{\n  "a": 1\n}')
    expect(store.leftFormatHint).toBeNull() // now pretty, hint clears itself
  })

  it('formatSide is a no-op when the hint is invalid or missing', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a": 1,}' }
    store.formatSide('left')
    expect(store.left.content).toBe('{"a": 1,}') // unchanged, still invalid
    store.formatSide('right') // no right file at all
    expect(store.right).toBeNull()
  })

  it('dismissFormatHint hides the hint until the content changes again', () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/a.json', name: 'a.json', content: '{"a":1}' }
    expect(store.leftFormatHint).not.toBeNull()
    store.dismissFormatHint('left')
    expect(store.leftFormatHint).toBeNull()
    store.left = { ...store.left, content: '{"b":2}' }
    expect(store.leftFormatHint).not.toBeNull() // new content, dismissal doesn't carry over
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
