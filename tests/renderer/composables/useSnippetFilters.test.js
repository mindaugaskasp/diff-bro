// The snippets sidebar's search + tag filter. Text query and tag selection
// COMPOSE (AND), which is the whole reason the logic lives in one composable
// instead of being re-derived per shelf — so it gets one home for its tests too.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import {
  DEFAULT_TAG,
  useSnippetFilters
} from '../../../src/renderer/src/composables/useSnippetFilters'

const KEY = randomBytes(32)
const names = (list) => list.map((e) => e.name)

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    vaultEncrypt: async (p, aad) => vaultEncrypt(KEY, p, aad),
    vaultDecrypt: async (b, aad) => vaultDecrypt(KEY, b, aad)
  }
})

// Three snippets: two tagged 'backend' (one also 'auth'), one untagged (Default).
async function seed() {
  const store = useSnippetStore()
  const auth = await store.add({
    name: 'Auth flow',
    content: 'x',
    language: 'plaintext',
    tags: ['backend', 'auth']
  })
  await store.add({
    name: 'Billing report',
    content: 'x',
    language: 'plaintext',
    tags: ['backend']
  })
  await store.add({ name: 'Scratch notes', content: 'x', language: 'plaintext', tags: [] })
  return { store, auth }
}

describe('useSnippetFilters — text search', () => {
  it('shows everything and reports not-filtering when the query is empty', async () => {
    await seed()
    const f = useSnippetFilters()
    expect(f.filtering.value).toBe(false)
    expect(names(f.visibleListed.value).sort()).toEqual([
      'Auth flow',
      'Billing report',
      'Scratch notes'
    ])
  })

  it('matches a snippet by name', async () => {
    await seed()
    const f = useSnippetFilters()
    f.query.value = 'billing'
    expect(f.filtering.value).toBe(true)
    expect(names(f.visibleListed.value)).toEqual(['Billing report'])
  })

  it('matches by tag text even when the name does not contain the query', async () => {
    await seed()
    const f = useSnippetFilters()
    f.query.value = 'backend' // no name contains "backend"; two carry the tag
    expect(names(f.visibleListed.value).sort()).toEqual(['Auth flow', 'Billing report'])
  })

  it('matches untagged snippets against the word "default"', async () => {
    await seed()
    const f = useSnippetFilters()
    f.query.value = 'default'
    expect(names(f.visibleListed.value)).toEqual(['Scratch notes'])
  })

  it('anyVisible goes falsy when nothing matches', async () => {
    await seed()
    const f = useSnippetFilters()
    f.query.value = 'nothing-here'
    expect(f.anyVisible.value).toBeFalsy()
  })
})

describe('useSnippetFilters — tag selection', () => {
  it('AND-composes multiple selected tags', async () => {
    await seed()
    const f = useSnippetFilters()
    f.toggleTag('backend')
    expect(names(f.visibleListed.value).sort()).toEqual(['Auth flow', 'Billing report'])
    f.toggleTag('auth') // backend AND auth
    expect(names(f.visibleListed.value)).toEqual(['Auth flow'])
    f.toggleTag('auth') // toggling off widens again
    expect(names(f.visibleListed.value).sort()).toEqual(['Auth flow', 'Billing report'])
  })

  it('the DEFAULT sentinel selects only untagged snippets', async () => {
    await seed()
    const f = useSnippetFilters()
    f.toggleTag(DEFAULT_TAG)
    expect(names(f.visibleListed.value)).toEqual(['Scratch notes'])
  })

  it('a text query and a tag selection compose', async () => {
    await seed()
    const f = useSnippetFilters()
    f.toggleTag('backend')
    f.query.value = 'billing'
    expect(names(f.visibleListed.value)).toEqual(['Billing report'])
  })

  it('clearFilters resets both the query and the tag set', async () => {
    await seed()
    const f = useSnippetFilters()
    f.toggleTag('backend')
    f.query.value = 'x'
    f.clearFilters()
    expect(f.filtering.value).toBe(false)
    expect(f.activeTags.value.size).toBe(0)
    expect(f.query.value).toBe('')
  })
})

describe('useSnippetFilters — favorites and chips', () => {
  it('favorited snippets move to visibleFavorites and are filtered too', async () => {
    const { store, auth } = await seed()
    store.toggleFavorite(auth)
    const f = useSnippetFilters()
    expect(names(f.visibleFavorites.value)).toEqual(['Auth flow'])
    expect(names(f.visibleListed.value)).not.toContain('Auth flow')

    f.query.value = 'billing' // the favorite no longer matches
    expect(f.visibleFavorites.value).toHaveLength(0)
    expect(names(f.visibleListed.value)).toEqual(['Billing report'])
  })

  it('tagChips lead with Default (its count) then the registry tags with usage counts', async () => {
    await seed()
    const f = useSnippetFilters()
    const chips = f.tagChips.value
    expect(chips[0]).toMatchObject({ name: DEFAULT_TAG, label: 'Default', count: 1 })
    expect(chips.find((c) => c.name === 'backend').count).toBe(2)
    expect(chips.find((c) => c.name === 'auth').count).toBe(1)
  })
})
