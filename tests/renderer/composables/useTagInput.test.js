// The snippet editor's tag-chips field. Its event logic — what commits a tag,
// what dedupes, the cap, Backspace-pops — is exactly the kind of interaction
// CLAUDE.md says to pull OUT of the .vue file and unit-test here (the "does
// Space commit a tag?" example), rather than leave inline where nothing
// exercises it. Suggestions need the real tag registry, so the store's crypto
// is wired through the same mock the store tests use.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import { MAX_TAGS, useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useTagInput } from '../../../src/renderer/src/composables/useTagInput'

const KEY = randomBytes(32)

// A KeyboardEvent stub carrying only what onKey reads.
const press = (k) => ({ key: k, preventDefault() {} })

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    vaultEncrypt: async (p, aad) => vaultEncrypt(KEY, p, aad),
    vaultDecrypt: async (b, aad) => vaultDecrypt(KEY, b, aad)
  }
})

describe('useTagInput — committing tags', () => {
  it('Enter, Space, and comma each commit the typed tag and clear the input', () => {
    for (const k of ['Enter', ' ', ',']) {
      const field = useTagInput()
      field.input.value = 'alpha'
      field.onKey(press(k))
      expect(field.tags.value).toEqual(['alpha'])
      // The tag never lingers as loose text that would be lost on save.
      expect(field.input.value).toBe('')
    }
  })

  it('lowercases and trims a committed tag (cleanTag)', () => {
    const field = useTagInput()
    field.input.value = '  Backend  '
    field.onKey(press('Enter'))
    expect(field.tags.value).toEqual(['backend'])
  })

  it('ignores a blank commit', () => {
    const field = useTagInput()
    field.input.value = '   '
    field.onKey(press(' '))
    expect(field.tags.value).toEqual([])
  })

  it('de-duplicates: re-committing an applied tag is a no-op but clears the input', () => {
    const field = useTagInput(['api'])
    field.input.value = 'api'
    field.onKey(press('Enter'))
    expect(field.tags.value).toEqual(['api'])
    expect(field.input.value).toBe('')
  })

  it('caps at MAX_TAGS', () => {
    const field = useTagInput(Array.from({ length: MAX_TAGS - 1 }, (_, i) => `t${i}`)) // MAX-1
    field.input.value = 'last'
    field.onKey(press('Enter')) // the MAX_TAGS-th is allowed
    expect(field.tags.value).toHaveLength(MAX_TAGS)
    expect(field.canAddMore.value).toBe(false)

    field.input.value = 'overflow'
    field.onKey(press('Enter')) // one past the cap is refused
    expect(field.tags.value).toHaveLength(MAX_TAGS)
    expect(field.tags.value).not.toContain('overflow')
  })

  it('Backspace pops the last tag only when the input is empty', () => {
    const field = useTagInput(['one', 'two'])
    field.onKey(press('Backspace')) // empty input → pop
    expect(field.tags.value).toEqual(['one'])

    field.input.value = 'th'
    field.onKey(press('Backspace')) // has text → leaves the chips alone
    expect(field.tags.value).toEqual(['one'])
  })

  it('onBlur commits pending text so leaving the field never drops it', () => {
    const field = useTagInput()
    field.input.value = 'draft'
    field.onBlur()
    expect(field.tags.value).toEqual(['draft'])
  })

  it('remove() drops a specific tag', () => {
    const field = useTagInput(['keep', 'drop'])
    field.remove('drop')
    expect(field.tags.value).toEqual(['keep'])
  })

  it('gives a brand-new tag a tentative palette color, surfaced via newColors()', () => {
    const field = useTagInput()
    field.add('fresh')
    // A real palette color, not the dim fallback used for unknown tags.
    expect(field.colorFor('fresh')).toMatch(/^#/)
    expect(field.newColors()).toHaveProperty('fresh')
  })
})

describe('useTagInput — suggestions', () => {
  it('suggests matching registry tags, excluding ones already applied', async () => {
    const store = useSnippetStore()
    await store.add({
      name: 's1',
      content: 'x',
      language: 'plaintext',
      tags: ['backend', 'billing']
    })
    const field = useTagInput(['backend']) // backend is already on this snippet
    field.input.value = 'b'
    expect(field.suggestions.value).toContain('billing')
    expect(field.suggestions.value).not.toContain('backend')
  })
})
