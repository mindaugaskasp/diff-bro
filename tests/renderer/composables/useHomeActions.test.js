import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const openSavedDiff = vi.fn()
const run = vi.fn()
vi.mock('../../../src/renderer/src/composables/useSavedDiffOpen', () => ({ openSavedDiff }))
vi.mock('../../../src/renderer/src/composables/useCommands', () => ({
  useCommands: () => ({ run })
}))

const { useHomeActions } = await import('../../../src/renderer/src/composables/useHomeActions')
const { useSnippetStore } = await import('../../../src/renderer/src/stores/snippetStore')
const { useDiffStore } = await import('../../../src/renderer/src/stores/diffStore')

beforeEach(() => {
  setActivePinia(createPinia())
  openSavedDiff.mockReset()
  run.mockReset()
})

describe('useHomeActions', () => {
  it('opens a saved or received diff in a tab', async () => {
    openSavedDiff.mockResolvedValue(true)
    await useHomeActions().openItem({ kind: 'received', id: 'r1' })
    expect(openSavedDiff).toHaveBeenCalledWith('r1')
  })

  it('says so when a diff can no longer be opened', async () => {
    openSavedDiff.mockResolvedValue(false)
    const diff = useDiffStore()
    const notice = vi.spyOn(diff, 'showNotice')
    await useHomeActions().openItem({ kind: 'diff', id: 'gone' })
    expect(notice).toHaveBeenCalledOnce()
  })

  it('opens a snippet in its editor', async () => {
    await useHomeActions().openItem({ kind: 'snippet', id: 's1' })
    expect(useSnippetStore().editingSnippet).toEqual({ id: 's1' })
  })

  it('runs a tool through the command registry', async () => {
    await useHomeActions().openItem({ kind: 'tool', id: 'json', action: 'tools-json' })
    expect(run).toHaveBeenCalledWith('tools-json')
  })
})
