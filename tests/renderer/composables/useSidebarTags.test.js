import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSidebarTags } from '../../../src/renderer/src/composables/useSidebarTags'
import { TAGS_PER_ROW } from '../../../src/renderer/src/utils/settingsDefaults'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

// A tall screen has room the default two rows do not use. The setting adds
// ROWS, never removes them: two is the floor as well as the default, so the
// sidebar can never be turned into a wall of tags with the lists squeezed out.
describe('useSidebarTags — how tall the shelf may be', () => {
  const manyTags = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, tags: [`tag-${i}`], name: `s${i}` }))

  it('shows two rows by default, unchanged', () => {
    useSnippetStore().entries = manyTags(40)
    expect(useSidebarTags().bar.value).toHaveLength(TAGS_PER_ROW * 2)
  })

  it('shows more once the reader asks for more rows', () => {
    useSnippetStore().entries = manyTags(40)
    useSettingsStore().tagShelfRows = 6
    expect(useSidebarTags().bar.value).toHaveLength(TAGS_PER_ROW * 6)
  })

  it('never shows fewer than the default, whatever it is set to', () => {
    useSnippetStore().entries = manyTags(40)
    for (const bad of [0, 1, -5, null, 'lots']) {
      useSettingsStore().tagShelfRows = bad
      expect(useSidebarTags().bar.value.length).toBeGreaterThanOrEqual(TAGS_PER_ROW * 2)
    }
  })

  it('counts what did not fit', () => {
    useSnippetStore().entries = manyTags(40)
    useSettingsStore().tagShelfRows = 4
    const tags = useSidebarTags()
    expect(tags.overflow.value).toBe(40 - TAGS_PER_ROW * 4)
  })
})
