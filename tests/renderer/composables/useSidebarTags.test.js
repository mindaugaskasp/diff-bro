import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSidebarTags } from '../../../src/renderer/src/composables/useSidebarTags'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

// One filter across the whole sidebar. How many of these fit on the shelf, and
// which are cut, belongs to useTagShelf — this is the registry they come from.
describe('useSidebarTags', () => {
  it('is the union of diff and snippet tags, counted across both', () => {
    useVaultStore().entries = [{ id: 'd1', tags: ['work', 'api'] }]
    useSnippetStore().entries = [
      { id: 's1', tags: ['work'] },
      { id: 's2', tags: ['keys'] }
    ]
    const tags = useSidebarTags()
    expect(tags.all.value.map((t) => t.name).sort()).toEqual(['api', 'keys', 'work'])
    expect(tags.all.value.find((t) => t.name === 'work').count).toBe(2)
  })

  it('ranks by how much carries the tag, so the busiest lead', () => {
    useSnippetStore().entries = [
      { id: 's1', tags: ['rare'] },
      { id: 's2', tags: ['common'] },
      { id: 's3', tags: ['common'] }
    ]
    expect(useSidebarTags().all.value[0].name).toBe('common')
  })

  it('picking toggles a tag on and off, and clear drops every one', () => {
    useSnippetStore().entries = [{ id: 's1', tags: ['work', 'api'] }]
    const tags = useSidebarTags()

    tags.pick('work')
    expect(tags.active.value).toEqual(['work'])
    tags.pick('api')
    expect(tags.active.value).toEqual(['work', 'api'])
    tags.pick('work')
    expect(tags.active.value).toEqual(['api'])

    tags.clear()
    expect(tags.active.value).toEqual([])
  })

  it('carries a colour for every tag, so a chip is never unpainted', () => {
    useSnippetStore().entries = [{ id: 's1', tags: ['work'] }]
    expect(useSidebarTags().all.value[0].color).toBeTruthy()
  })
})
