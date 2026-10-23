import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useTabScroll } from '../../../src/renderer/src/composables/useTabScroll'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('useTabScroll', () => {
  it('puts the active tab back where it was, once', async () => {
    const tabs = useTabsStore()
    tabs.init()
    tabs.active.scrollTop = 640
    const restore = useTabScroll()
    const pane = { setScrollTop: vi.fn() }
    restore(pane)
    restore(pane)
    expect(pane.setScrollTop).toHaveBeenCalledTimes(1)
    expect(pane.setScrollTop).toHaveBeenCalledWith(640)
    await nextTick()
  })

  it('leaves a tab never scrolled at the top', () => {
    useTabsStore().init()
    const pane = { setScrollTop: vi.fn() }
    useTabScroll()(pane)
    expect(pane.setScrollTop).not.toHaveBeenCalled()
  })
})
