import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSnippetTabs } from '../../../src/renderer/src/composables/useSnippetTabs'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useTabsStore } from '../../../src/renderer/src/stores/tabsStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  useTabsStore().init()
})

describe('useSnippetTabs', () => {
  it('turns a request to edit a snippet into a tab named after it', async () => {
    const snippets = useSnippetStore()
    snippets.entries = [{ id: 's1', name: 'Notes', tags: [] }]
    const { activeSnippetTab } = useSnippetTabs()
    snippets.editingSnippet = { id: 's1' }
    await nextTick()
    expect(snippets.editingSnippet).toBeNull()
    expect(activeSnippetTab.value.title).toBe('Notes')
    expect(activeSnippetTab.value.snippet.id).toBe('s1')
  })

  it('carries a new snippet’s starting text into its tab', async () => {
    const snippets = useSnippetStore()
    const { activeSnippetTab } = useSnippetTabs()
    snippets.editingSnippet = { id: null, initialContent: 'from the clipboard' }
    await nextTick()
    expect(activeSnippetTab.value.snippet.initial.initialContent).toBe('from the clipboard')
  })

  it('reports no snippet tab while a comparison is in front', () => {
    expect(useSnippetTabs().activeSnippetTab.value).toBeNull()
  })
})
