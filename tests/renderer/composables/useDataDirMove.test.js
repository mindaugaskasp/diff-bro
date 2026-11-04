import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useDataDirMove } from '../../../src/renderer/src/composables/useDataDirMove'
import { useSnippetTabs } from '../../../src/renderer/src/composables/useSnippetTabs'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'

const calls = []
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  calls.length = 0
  window.api = {
    dataDirChoose: vi.fn(async () => (calls.push('choose'), { ok: true, dir: '/x' })),
    dataDirReset: vi.fn(async () => (calls.push('reset'), { ok: true, dir: '/d' })),
    relaunch: vi.fn(async () => calls.push('relaunch'))
  }
  useTabsStore().init()
})
afterEach(() => delete window.api)

async function openDirtySnippet() {
  const { activeSnippetTab } = useSnippetTabs()
  useSnippetStore().editingSnippet = { id: null, initialContent: '' }
  await nextTick()
  useTabsStore().setSnippetMeta(activeSnippetTab.value.id, { dirty: true })
}

describe('useDataDirMove', () => {
  it('moves, saves the session, then restarts', async () => {
    const saveSession = vi.spyOn(useTabsStore(), 'saveSession')
    await useDataDirMove().choose()
    expect(saveSession).toHaveBeenCalled()
    expect(calls).toEqual(['choose', 'relaunch'])
  })

  it('a cancelled pick or confirm restarts nothing', async () => {
    window.api.dataDirReset = vi.fn(async () => ({ canceled: true }))
    await useDataDirMove().reset()
    expect(calls).toEqual([])
  })

  it('an unsaved snippet tab blocks the move before the folder is picked', async () => {
    await openDirtySnippet()
    await useDataDirMove().choose()
    expect(calls).toEqual([])
    expect(useDiffStore().notice).toBeTruthy()
  })
})
