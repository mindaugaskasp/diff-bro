import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useSnippetDiffSync } from '../../../src/renderer/src/composables/useSnippetDiffSync'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'

let bodies

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  bodies = new Map()
  window.api = {
    vaultEncrypt: async (plaintext) => {
      const iv = String(bodies.size)
      bodies.set(iv, plaintext)
      return { iv, data: iv }
    },
    vaultDecrypt: async ({ iv }) => bodies.get(iv) ?? null,
    storeSave: () => {},
    copyText: () => {}
  }
})

const seed = (name, content) => useSnippetStore().add({ name, content, language: 'plaintext' })

// A pasted copy is dead the moment the snippet moves on. The link is the point:
// edit the snippet and the comparison on screen follows.
describe('useSnippetDiffSync', () => {
  it('re-reads a side when the snippet behind it is edited', async () => {
    const diff = useDiffStore()
    const snippets = useSnippetStore()
    const id = await seed('Config', 'before')
    await diff.dropSnippets([id])
    useSnippetDiffSync()

    await snippets.update(id, { name: 'Config', content: 'after', language: 'plaintext' })
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    expect(diff.left.content).toBe('after')
  })

  it('marks the comparison unsaved again, since it no longer matches what was saved', async () => {
    const diff = useDiffStore()
    const snippets = useSnippetStore()
    const id = await seed('Config', 'before')
    await diff.dropSnippets([id])
    useSnippetDiffSync()
    diff.diffSaved = true

    await snippets.update(id, { name: 'Config', content: 'after', language: 'plaintext' })
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    expect(diff.diffSaved).toBe(false)
  })

  it('ignores an edit to a snippet that is not on screen', async () => {
    const diff = useDiffStore()
    const snippets = useSnippetStore()
    const shown = await seed('Shown', 'before')
    const other = await seed('Other', 'x')
    await diff.dropSnippets([shown])
    useSnippetDiffSync()

    await snippets.update(other, { name: 'Other', content: 'changed', language: 'plaintext' })
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    expect(diff.left.content).toBe('before')
  })

  // Blanking a side would destroy what the reader is looking at.
  it('leaves the comparison standing when the snippet is deleted', async () => {
    const diff = useDiffStore()
    const snippets = useSnippetStore()
    const id = await seed('Config', 'before')
    await diff.dropSnippets([id])
    useSnippetDiffSync()

    snippets.entries = snippets.entries.filter((e) => e.id !== id)
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    expect(diff.left.content).toBe('before')
  })

  it('does nothing when no side came from a snippet', async () => {
    const diff = useDiffStore()
    diff.left = { path: '/a.txt', name: 'a.txt', content: 'file' }
    useSnippetDiffSync()
    await seed('New', 'x')
    await nextTick()
    expect(diff.left.content).toBe('file')
  })
})
