// History rides the store's real crypto path: the mocked window.api routes
// through the actual main-process vaultCrypt, so an old box either decrypts
// with the entry's unchanged AAD or the design is wrong.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { MAX_SNIPPET_HISTORY } from '../../../src/renderer/src/utils/snippetHistory'
import { migrate } from '../../../src/renderer/src/utils/snippetState'

const KEY = randomBytes(32)

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    vaultEncrypt: async (plaintext, aad) => vaultEncrypt(KEY, plaintext, aad),
    vaultDecrypt: async (box, aad) => vaultDecrypt(KEY, box, aad)
  }
})

async function addSnippet(store, content = 'v1') {
  return store.add({ name: 'Config', content, language: 'auto', marks: false })
}

describe('recording versions on edit', () => {
  it('a content edit keeps the superseded box, decryptable, stamped with its write time', async () => {
    const store = useSnippetStore()
    const id = await addSnippet(store)
    const writtenAt = store.entries[0].updatedAt

    await store.update(id, { name: 'Config', content: 'v2', contentChanged: true })

    const entry = store.entries[0]
    expect(entry.history).toHaveLength(1)
    expect(entry.history[0].savedAt).toBe(writtenAt)
    expect(await store.loadVersion(id, 0)).toBe('v1')
    expect(await store.load(id)).toBe('v2')
  })

  it('a name/tag-only edit records nothing', async () => {
    const store = useSnippetStore()
    const id = await addSnippet(store)
    await store.update(id, { name: 'Renamed', content: 'v1', contentChanged: false })
    expect(store.entries[0].history ?? []).toHaveLength(0)
    expect(store.entries[0].name).toBe('Renamed')
  })

  it('history survives persistence and caps at the limit, oldest first out', async () => {
    const store = useSnippetStore()
    const id = await addSnippet(store, 'v0')
    for (let i = 1; i <= MAX_SNIPPET_HISTORY + 2; i++) {
      await store.update(id, { name: 'Config', content: `v${i}`, contentChanged: true })
    }
    store.reload()
    const entry = store.entries[0]
    expect(entry.history).toHaveLength(MAX_SNIPPET_HISTORY)
    // v0 and v1 fell off the front; the oldest kept version is v2.
    expect(await store.loadVersion(id, 0)).toBe('v2')
    expect(await store.loadVersion(id, MAX_SNIPPET_HISTORY - 1)).toBe(`v${MAX_SNIPPET_HISTORY + 1}`)
    expect(await store.load(id)).toBe(`v${MAX_SNIPPET_HISTORY + 2}`)
  })
})

describe('loadVersion', () => {
  it('returns null for an index that does not exist', async () => {
    const store = useSnippetStore()
    const id = await addSnippet(store)
    expect(await store.loadVersion(id, 0)).toBeNull()
    expect(await store.loadVersion('nope', 0)).toBeNull()
  })

  it('a tampered version returns null but never drops the entry', async () => {
    const store = useSnippetStore()
    const id = await addSnippet(store)
    await store.update(id, { name: 'Config', content: 'v2', contentChanged: true })
    store.entries[0].history[0].data = store.entries[0].history[0].data.replace(/^../, 'ff')
    expect(await store.loadVersion(id, 0)).toBeNull()
    expect(store.entries).toHaveLength(1)
    expect(await store.load(id)).toBe('v2')
  })

  it('a locked vault key surfaces as keyError, not a crash', async () => {
    const store = useSnippetStore()
    const id = await addSnippet(store)
    await store.update(id, { name: 'Config', content: 'v2', contentChanged: true })
    window.api.vaultDecrypt = async () => ({ error: 'vault-key-unavailable' })
    expect(await store.loadVersion(id, 0)).toBeNull()
    expect(store.keyError).toBe('vault-key-unavailable')
  })
})

describe('hostile shapes and boundaries', () => {
  it('migrate defaults history and drops malformed versions (rule 6)', () => {
    const entry = { id: 'a', aadSalt: 's', name: 'n', createdAt: 1, tags: [], iv: 'i', data: 'd' }
    const parsed = {
      tags: {},
      entries: [
        { ...entry },
        { ...entry, id: 'b', history: 'not-an-array' },
        { ...entry, id: 'c', history: [{ savedAt: 1, iv: 'x', data: 'y' }, { savedAt: 'bad' }] }
      ]
    }
    const state = migrate(parsed, 'Untitled')
    expect(state.entries[0].history).toEqual([])
    expect(state.entries[1].history).toEqual([])
    expect(state.entries[2].history).toEqual([{ savedAt: 1, iv: 'x', data: 'y' }])
  })

  it('an exported bundle carries no history', async () => {
    const store = useSnippetStore()
    const id = await addSnippet(store)
    await store.update(id, { name: 'Config', content: 'v2', contentChanged: true })
    const bundle = await store.fullBundle()
    expect(bundle.snippets).toHaveLength(1)
    expect(bundle.snippets[0].content).toBe('v2')
    expect(JSON.stringify(bundle)).not.toContain('history')
  })
})
