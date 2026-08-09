// The card's Copy: full contents (the preview text is truncated for display),
// the row's claude-fill routing, and a flash only once the write succeeded.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../../src/main/vaultCrypt'
import { useSnippetPreview } from '../../../src/renderer/src/composables/useSnippetPreview'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'

const KEY = randomBytes(32)

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {
    vaultEncrypt: async (plaintext, aad) => vaultEncrypt(KEY, plaintext, aad),
    vaultDecrypt: async (box, aad) => vaultDecrypt(KEY, box, aad),
    copyText: vi.fn(async () => ({ ok: true }))
  }
})

async function hoveredPreview(preview, entry) {
  preview.preview.value = {
    id: entry.id,
    name: entry.name,
    tags: entry.tags,
    lang: entry.language === 'claude' ? 'claude' : '',
    secret: false,
    text: 'truncated…',
    style: {}
  }
}

describe('copyPreview', () => {
  it('copies the full stored contents, not the truncated card text, and flashes', async () => {
    const store = useSnippetStore()
    const id = await store.add({ name: 'Note', content: 'the full body', marks: false })
    const preview = useSnippetPreview()
    await hoveredPreview(
      preview,
      store.entries.find((e) => e.id === id)
    )

    await preview.copyPreview()
    expect(window.api.copyText).toHaveBeenCalledWith('the full body')
    expect(preview.copied.value).toBe(true)
  })

  it('routes a claude prompt with placeholders to the fill dialog instead', async () => {
    const store = useSnippetStore()
    const id = await store.add({
      name: 'Review prompt',
      content: 'Review {{file}} for {{concern}}.',
      language: 'claude',
      marks: false
    })
    const preview = useSnippetPreview()
    await hoveredPreview(
      preview,
      store.entries.find((e) => e.id === id)
    )

    await preview.copyPreview()
    expect(window.api.copyText).not.toHaveBeenCalled()
    expect(store.pendingFill).toEqual({
      name: 'Review prompt',
      content: 'Review {{file}} for {{concern}}.'
    })
    // The card dismisses — the fill dialog takes over the interaction.
    expect(preview.preview.value).toBeNull()
  })

  it('a failed clipboard write says so instead of flashing', async () => {
    window.api.copyText = vi.fn(async () => ({ ok: false }))
    const store = useSnippetStore()
    const id = await store.add({ name: 'Note', content: 'body', marks: false })
    const preview = useSnippetPreview()
    await hoveredPreview(
      preview,
      store.entries.find((e) => e.id === id)
    )

    await preview.copyPreview()
    expect(preview.copied.value).toBe(false)
    // The row's copy reports this failure; the card must speak with one voice.
    expect(useDiffStore().notice).toMatch(/could not copy/i)
  })

  it('is a no-op with no card open', async () => {
    const preview = useSnippetPreview()
    await preview.copyPreview()
    expect(window.api.copyText).not.toHaveBeenCalled()
  })
})
