// What keeps the stored session in step with the window. The watcher is
// deliberately narrow — a toast or an open dialog must not cost a re-seal — and
// the debounce is what stops a paste-mode keystroke writing a file each time.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import { useSessionPersistence } from '../../../src/renderer/src/composables/useSessionPersistence'
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'

const DELAY = 10
let seals = 0
let session

const start = () => useSessionPersistence({ delay: DELAY })

// Let the watcher run, then let its debounce expire and the seal resolve.
async function settle() {
  await nextTick()
  await vi.advanceTimersByTimeAsync(DELAY)
}

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  localStorage.clear()
  seals = 0
  session = null
  window.api = {
    vaultEncrypt: async (plaintext) => {
      seals += 1
      return { iv: 'iv', data: plaintext }
    },
    storeLoad: () => session,
    storeSave: (name, contents) => {
      session = contents
    }
  }
  const tabs = useTabsStore()
  tabs.init()
  tabs.sessionReady = true
})

afterEach(() => {
  vi.useRealTimers()
  delete window.api
})

describe('useSessionPersistence', () => {
  it('writes the session after a change settles', async () => {
    const diff = useDiffStore()
    start()
    diff.pasteLeft = 'typed'
    expect(session).toBeNull()
    await settle()
    expect(session).toContain('typed')
  })

  it('coalesces a burst of edits into one write', async () => {
    const diff = useDiffStore()
    start()
    for (const text of ['t', 'ty', 'typ', 'type']) {
      diff.pasteLeft = text
      await nextTick()
      await vi.advanceTimersByTimeAsync(DELAY / 2)
    }
    await settle()
    expect(seals).toBe(1)
    expect(session).toContain('type')
  })

  it('ignores state that is not part of the comparison', async () => {
    const diff = useDiffStore()
    start()
    useUiStore().showSettingsDialog = true
    diff.showNotice('saved')
    diff.stats = { additions: 1, deletions: 0 }
    await settle()
    expect(seals).toBe(0)
  })

  it('follows a tab being renamed, opened and closed', async () => {
    const diff = useDiffStore()
    const tabs = useTabsStore()
    start()
    // Both sides: a half-loaded tab is reset on the way out, so a one-sided
    // one would pack as blank and never carry the name at all.
    diff.left = { path: '/tmp/a.txt', name: 'a.txt', content: 'a' }
    diff.right = { path: '/tmp/b.txt', name: 'b.txt', content: 'b' }
    await settle()

    tabs.rename(tabs.activeId, 'prod vs staging')
    await settle()
    expect(session).toContain('prod vs staging')

    tabs.newTab()
    await settle()
    expect(seals).toBe(3)
  })

  it('flushes on demand, without waiting out the debounce', async () => {
    const diff = useDiffStore()
    const { flush } = start()
    diff.pasteRight = 'unsaved'
    await nextTick()
    await flush()
    expect(session).toContain('unsaved')
  })

  it('stops watching once it is stopped', async () => {
    const diff = useDiffStore()
    const { stop } = start()
    stop()
    diff.pasteLeft = 'after'
    await settle()
    expect(seals).toBe(0)
  })
})
