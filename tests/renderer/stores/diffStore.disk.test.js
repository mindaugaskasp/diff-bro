// What happens when the files move under a live comparison.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DISK_NOTICE_MS, useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { runCommand } from '../../../src/renderer/src/utils/commands'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

// Menu actions dispatch through the command registry now, not the store. These
// stay here because what they assert is the real store effect, end to end.
const menu = (action) =>
  runCommand(action, {
    diff: useDiffStore(),
    tabs: useTabsStore(),
    settings: useSettingsStore()
  })

const FILE = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })

// "Saved" is what silences the discard prompts, so a comparison that no longer
// matches the vault copy must stop claiming to be it.
describe('staying honest about what is saved', () => {
  const FILE_AT = (name, content) => ({ path: `/tmp/${name}`, name, content })

  it('a file changing on disk makes the reloaded comparison unsaved again', async () => {
    const store = useDiffStore()
    store.left = FILE_AT('a.txt', 'before')
    store.right = FILE_AT('b.txt', 'other')
    store.markSaved()
    window.api = {
      readFile: async (path) =>
        path.endsWith('a.txt')
          ? { path, name: 'a.txt', content: 'edited elsewhere' }
          : { path, name: 'b.txt', content: 'other' }
    }

    await store.refreshFromDisk()
    expect(store.left.content).toBe('edited elsewhere')
    expect(store.diffSaved).toBe(false)
  })

  it('leaves a diff alone when nothing on disk actually changed', async () => {
    const store = useDiffStore()
    store.left = FILE_AT('a.txt', 'same')
    store.markSaved()
    window.api = { readFile: async (path) => ({ path, name: 'a.txt', content: 'same' }) }

    await store.refreshFromDisk()
    expect(store.diffSaved).toBe(true)
  })
})

// The change check compared `content`, which a spreadsheet has none of, so no
// workbook ever reloaded.
describe('following a spreadsheet on disk', () => {
  const book = (v) => ({
    path: '/tmp/book.xlsx',
    name: 'book.xlsx',
    kind: 'spreadsheet',
    sheets: [{ name: 'S1', rows: [['a', v]] }]
  })

  it('reloads a workbook whose grid changed, and says so', async () => {
    const store = useDiffStore()
    store.left = book(1)
    store.markSaved()
    window.api = { readFile: async () => book(2) }

    await store.refreshFromDisk()
    expect(store.left.sheets[0].rows[0][1]).toBe(2)
    expect(store.diskNotice).toContain('changed on disk')
    expect(store.diffSaved).toBe(false)
  })

  it('leaves an untouched workbook alone', async () => {
    const store = useDiffStore()
    store.left = book(1)
    store.markSaved()
    window.api = { readFile: async () => book(1) }

    await store.refreshFromDisk()
    expect(store.diskNotice).toBeNull()
    expect(store.diffSaved).toBe(true)
  })
})

// A second save adds nothing but a duplicate row, so it is not offered.
describe('saving the same comparison twice', () => {
  it('is not offered while the comparison on screen is already saved', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    expect(store.hasUnsavedWork).toBe(true)

    store.markSaved()
    expect(store.canSave).toBe(true) // there is still a comparison to share
    expect(store.hasUnsavedWork).toBe(false)

    menu('save')
    expect(store.showSaveDialog).toBe(false)
  })

  it('is offered again the moment the comparison changes', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    store.markSaved()

    store.swap()
    expect(store.hasUnsavedWork).toBe(true)
  })

  it('is never offered for an empty comparison', () => {
    expect(useDiffStore().hasUnsavedWork).toBe(false)
  })
})

// Format rewrites a side in memory, so the app's copy and the file diverge. The
// focus re-read saw a difference it had caused itself, threw the formatting
// away, and reported a disk change that never happened.
describe('when the app and the disk have both moved', () => {
  const UGLY = '{"a":1}'
  const onDisk = (content) => ({ path: '/tmp/a.json', name: 'a.json', content })

  it('keeps a side the app reformatted, and does not claim the disk changed', async () => {
    const store = useDiffStore()
    store.left = onDisk(UGLY)
    store.formatSide('left')
    const formatted = store.left.content
    expect(formatted).not.toBe(UGLY)

    window.api = { readFile: async () => onDisk(UGLY) }
    await store.refreshFromDisk()

    expect(store.left.content).toBe(formatted)
    expect(store.diskNotice).toBeNull()
  })

  it('holds the app’s copy when the file ALSO changed, and says which', async () => {
    const store = useDiffStore()
    store.left = onDisk(UGLY)
    store.formatSide('left')
    const formatted = store.left.content

    window.api = { readFile: async () => onDisk('{"a":2}') }
    await store.refreshFromDisk()

    expect(store.left.content).toBe(formatted)
    expect(store.diskNotice).toContain('a.json')
    expect(store.diskNotice).toContain('changed on disk')
    expect(store.diskNotice).toContain('kept')
  })

  it('follows the disk again once the side is reloaded from it', async () => {
    const store = useDiffStore()
    store.left = onDisk(UGLY)
    store.formatSide('left')

    // Re-picking the file is the deliberate "take theirs".
    store.receive('left', onDisk('{"a":2}'))
    window.api = { readFile: async () => onDisk('{"a":3}') }
    await store.refreshFromDisk()

    expect(store.left.content).toBe('{"a":3}')
    expect(store.diskNotice).toContain('diff reloaded')
  })

  it('still reloads an untouched side while another is held back', async () => {
    const store = useDiffStore()
    store.left = onDisk(UGLY)
    store.formatSide('left')
    store.right = { path: '/tmp/b.json', name: 'b.json', content: 'old' }

    window.api = {
      readFile: async (path) =>
        path.endsWith('a.json') ? onDisk('{"a":9}') : { ...store.right, content: 'new' }
    }
    await store.refreshFromDisk()

    expect(store.right.content).toBe('new')
    expect(store.diskNotice).toContain('a.json')
    expect(store.diskNotice).toContain('b.json')
  })
})

// A held, dismissible label — not a toast that clears itself out from under you.
describe('the file-changed label', () => {
  const onDisk = (content) => ({ path: '/tmp/a.txt', name: 'a.txt', content })

  it('goes up on a disk change and clears itself after its window', async () => {
    vi.useFakeTimers()
    try {
      const store = useDiffStore()
      store.left = onDisk('before')
      window.api = { readFile: async () => onDisk('after') }

      await store.refreshFromDisk()
      expect(store.diskNotice).toContain('a.txt')

      vi.advanceTimersByTime(DISK_NOTICE_MS - 1)
      expect(store.diskNotice).not.toBeNull()
      vi.advanceTimersByTime(1)
      expect(store.diskNotice).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('outlives the ordinary toast, which would have cleared first', () => {
    expect(DISK_NOTICE_MS).toBeGreaterThan(5000)
  })

  it('can be dismissed by hand, and stays dismissed', () => {
    vi.useFakeTimers()
    try {
      const store = useDiffStore()
      store.showDiskNotice('"a.txt" changed on disk — diff reloaded.')
      store.dismissDiskNotice()
      expect(store.diskNotice).toBeNull()

      // The timer it cancelled cannot come back and blank a later one.
      store.showDiskNotice('second')
      vi.advanceTimersByTime(DISK_NOTICE_MS - 1)
      expect(store.diskNotice).toBe('second')
    } finally {
      vi.useRealTimers()
    }
  })
})
