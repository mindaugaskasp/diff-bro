// Snippets dropped into the diff pane.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

// Dropped snippets route through the SAME dropFiles the file path uses, so the
// replace guard, one-then-wait and two-fill-both come free rather than being
// re-implemented where they could drift.
describe('dropSnippets', () => {
  beforeEach(() => {
    const store = new Map()
    window.api.vaultEncrypt = async (plaintext) => {
      const iv = String(store.size)
      store.set(iv, plaintext)
      return { iv, data: iv }
    }
    window.api.vaultDecrypt = async ({ iv }) => store.get(iv) ?? null
  })

  const seed = async (over = {}) => {
    const snippets = useSnippetStore()
    return snippets.add({ name: 'Deploy config', content: '{"a":1}', language: 'json', ...over })
  }

  it('fills the left side from one snippet and waits for the right', async () => {
    const diff = useDiffStore()
    const id = await seed()
    await diff.dropSnippets([id])
    expect(diff.left).toMatchObject({ path: null, name: 'Deploy config', snippetId: id })
    expect(diff.right).toBeNull()
  })

  it('fills both sides from two', async () => {
    const diff = useDiffStore()
    const a = await seed({ name: 'One' })
    const b = await seed({ name: 'Two', content: '{"a":2}' })
    await diff.dropSnippets([a, b])
    expect(diff.left.name).toBe('One')
    expect(diff.right.name).toBe('Two')
  })

  it('drops onto the side the row was released over', async () => {
    const diff = useDiffStore()
    const id = await seed({ name: 'Righty' })
    await diff.dropSnippets([id], 'right')
    expect(diff.right.name).toBe('Righty')
    expect(diff.left).toBeNull()
  })

  it('refuses a secret snippet and says so', async () => {
    const diff = useDiffStore()
    const id = await seed({ name: 'Prod API key', secret: true })
    await diff.dropSnippets([id])
    expect(diff.left).toBeNull()
    expect(diff.notice).toMatch(/hidden/i)
  })

  it('ignores an id that is not in the library', async () => {
    const diff = useDiffStore()
    await diff.dropSnippets(['no-such-id'])
    expect(diff.left).toBeNull()
  })

  // The comparison is a copy; nothing here may write back to the library.
  it('leaves the snippet itself untouched', async () => {
    const diff = useDiffStore()
    const snippets = useSnippetStore()
    const id = await seed()
    const before = JSON.stringify(snippets.entries)
    await diff.dropSnippets([id])
    diff.clear()
    expect(JSON.stringify(snippets.entries)).toBe(before)
  })
})
