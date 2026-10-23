import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import {
  listenForAppUpdate,
  useAppUpdated
} from '../../../src/renderer/src/composables/useAppUpdated'
import { useSnippetTabs } from '../../../src/renderer/src/composables/useSnippetTabs'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'

let announce
const calls = []

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  calls.length = 0
  window.api = {
    onAppUpdated: (handler) => (announce = handler),
    relaunch: vi.fn(async () => calls.push('relaunch'))
  }
  useTabsStore().init()
  listenForAppUpdate()
})
afterEach(() => {
  useAppUpdated().dismiss()
  delete window.api
})

async function openDirtySnippet() {
  const snippets = useSnippetStore()
  const { activeSnippetTab } = useSnippetTabs()
  snippets.editingSnippet = { id: null, initialContent: '' }
  await nextTick()
  const tab = activeSnippetTab.value
  useTabsStore().setSnippetMeta(tab.id, { dirty: true })
  return tab
}

describe('useAppUpdated', () => {
  it('shows nothing until main reports a new build', () => {
    expect(useAppUpdated().version.value).toBeNull()
    announce('0.11.0')
    expect(useAppUpdated().version.value).toBe('0.11.0')
  })

  it('seals the session before relaunching', async () => {
    const tabs = useTabsStore()
    vi.spyOn(tabs, 'saveSession').mockImplementation(async () => calls.push('save'))
    announce('0.11.0')
    await useAppUpdated().restart()
    expect(calls).toEqual(['save', 'relaunch'])
  })

  it('refuses while a snippet has unsaved changes and brings it to the front', async () => {
    const draft = await openDirtySnippet()
    const tabs = useTabsStore()
    tabs.newTab()
    expect(tabs.activeId).not.toBe(draft.id)
    announce('0.11.0')
    const updated = useAppUpdated()
    await updated.restart()
    expect(window.api.relaunch).not.toHaveBeenCalled()
    expect(updated.blocked.value).toBe(true)
    expect(tabs.activeId).toBe(draft.id)
  })

  it('dismiss hides the notice and clears a refusal', async () => {
    await openDirtySnippet()
    announce('0.11.0')
    const updated = useAppUpdated()
    await updated.restart()
    updated.dismiss()
    expect(updated.version.value).toBeNull()
    expect(updated.blocked.value).toBe(false)
  })
})
