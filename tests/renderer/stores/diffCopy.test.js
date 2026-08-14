import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { runCommand } from '../../../src/renderer/src/utils/commands'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

const clipboard = (result = { ok: true }) => {
  const writes = []
  window.api.copyText = async (text) => (writes.push(text), result)
  return writes
}

const loaded = (store) => {
  store.left = { path: '/tmp/a.txt', name: 'a.txt', content: 'left contents\n' }
  store.right = { path: '/tmp/b.txt', name: 'b.txt', content: 'right contents\n' }
}

// Copying a SIDE is not copying the diff: it puts that file's own text on the
// clipboard, verbatim, so it can be pasted back into whatever it came from.
describe('copySide', () => {
  it('copies each side verbatim, not the patch between them', async () => {
    const store = useDiffStore()
    loaded(store)
    const writes = clipboard()

    await store.copySide('left')
    expect(writes).toEqual(['left contents\n'])

    await store.copySide('right')
    expect(writes[1]).toBe('right contents\n')
    // The give-away that this is not the patch path.
    expect(writes.join()).not.toContain('---')
  })

  it('names the file it copied, so two slots cannot be confused', async () => {
    const store = useDiffStore()
    loaded(store)
    clipboard()
    await store.copySide('left')
    expect(store.notice).toContain('a.txt')
  })

  it('says so when the clipboard write fails', async () => {
    const store = useDiffStore()
    loaded(store)
    clipboard({ ok: false })
    await store.copySide('right')
    expect(store.notice).toContain('Could not copy')
  })

  it('copies the pasted buffers in paste mode', async () => {
    const store = useDiffStore()
    store.mode = 'paste'
    store.pasteLeft = 'typed on the left'
    store.pasteRight = 'typed on the right'
    const writes = clipboard()
    await store.copySide('right')
    expect(writes).toEqual(['typed on the right'])
  })

  // The slot hides its copy control for these, so reaching the action means a
  // shortcut or menu fired. It must not write a stale clipboard or claim it did.
  it('does nothing for a side with no text to give', async () => {
    const store = useDiffStore()
    const sheets = [{ name: 'S1', rows: [['Region', 100]] }]
    store.left = { path: '/tmp/l.xlsx', name: 'l.xlsx', kind: 'spreadsheet', sheets }
    store.right = { path: '/tmp/huge.log', name: 'huge.log', kind: 'streamed' }
    const writes = clipboard()

    await store.copySide('left')
    await store.copySide('right')
    expect(writes).toEqual([])
    expect(store.notice).toBe(null)
  })

  it('does nothing when the slot is empty', async () => {
    const store = useDiffStore()
    const writes = clipboard()
    await store.copySide('left')
    expect(writes).toEqual([])
  })

  // One uncopyable side must not disable the other.
  it('still copies the text side of a mixed comparison', async () => {
    const store = useDiffStore()
    store.left = { path: '/tmp/l.xlsx', name: 'l.xlsx', kind: 'spreadsheet', sheets: [] }
    store.right = { path: '/tmp/b.csv', name: 'b.csv', content: 'a,b\n1,2\n' }
    const writes = clipboard()

    await store.copySide('left')
    expect(writes).toEqual([])
    await store.copySide('right')
    expect(writes).toEqual(['a,b\n1,2\n'])
  })
})

// The menu, the palette and Cmd+Shift+1/2 all arrive here.
describe('the copy-left / copy-right commands', () => {
  it('reach the store action for their own side', async () => {
    const diff = useDiffStore()
    loaded(diff)
    const writes = clipboard()

    await runCommand('copy-left', { diff })
    await runCommand('copy-right', { diff })
    expect(writes).toEqual(['left contents\n', 'right contents\n'])
  })
})
