import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'

// A URL snippet may only ever be one the user typed on this machine. If it
// could travel in a shared bundle, an imported file could plant a link that a
// single click opens — so it must never leave and never arrive.
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    vaultEncrypt: async (t) => ({ ok: true, data: `enc:${t}` }),
    vaultDecrypt: async (d) => ({ ok: true, text: String(d).replace(/^enc:/, '') }),
    exportSnippets: vi.fn(async () => ({ ok: true })),
    listTrustedKeys: async () => []
  }
})

const urlEntry = { name: 'Jira board', content: 'https://example.com/board', language: 'url' }
const textEntry = { name: 'Note', content: 'plain text', language: 'plaintext' }

describe('URL snippets never travel', () => {
  it('is left out of an exported bundle', async () => {
    const store = useSnippetStore()
    await store.add({ ...urlEntry, tags: [] })
    await store.add({ ...textEntry, tags: [] })

    await store.exportAll('passphrase')
    const [bundle] = window.api.exportSnippets.mock.calls[0]
    const names = bundle.snippets.map((s) => s.name)
    expect(names).toContain('Note')
    expect(names).not.toContain('Jira board')
  })

  it('is dropped from an imported bundle instead of being created', async () => {
    const store = useSnippetStore()
    await store.restoreBundle({ snippets: [urlEntry, textEntry], tags: [] })

    const names = store.entries.map((e) => e.name)
    expect(names).toContain('Note')
    expect(names).not.toContain('Jira board')
  })
})
