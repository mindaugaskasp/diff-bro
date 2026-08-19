import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSnippetRowActions } from '../../../src/renderer/src/composables/useSnippetRowActions'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'

// Every one of these loads the content on demand — a row holds metadata, never
// plaintext — and two of them hand a URL to MAIN, which is where the scheme is
// fenced. Pulled out of SnippetRow.vue so they are exercised at all.

const api = {}
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  Object.assign(api, {
    copyText: vi.fn(async () => ({ ok: true })),
    openLink: vi.fn(async () => ({})),
    openClaudeLink: vi.fn(async () => ({}))
  })
  window.api = api
})

const withContent = (entry, content) => {
  const store = useSnippetStore()
  store.load = vi.fn(async () => content)
  return { store, actions: useSnippetRowActions(() => entry) }
}

describe('useSnippetRowActions', () => {
  it('copies the decrypted body and flashes', async () => {
    const { actions } = withContent({ id: 'a', name: 'n', language: 'sql' }, 'SELECT 1')
    await actions.copySnippet()
    expect(api.copyText).toHaveBeenCalledWith('SELECT 1')
    expect(actions.copied.value).toBe(true)
  })

  it('never copies when the body cannot be read', async () => {
    const { actions } = withContent({ id: 'a', name: 'n' }, null)
    await actions.copySnippet()
    expect(api.copyText).not.toHaveBeenCalled()
  })

  // A Claude prompt with placeholders goes through the fill dialog first —
  // copying it raw would hand out `{{variables}}`.
  it('routes a placeholder prompt to the fill dialog instead of the clipboard', async () => {
    const { store, actions } = withContent(
      { id: 'a', name: 'Review', language: 'claude' },
      'Review {{file}}'
    )
    await actions.copySnippet()
    expect(api.copyText).not.toHaveBeenCalled()
    expect(store.pendingFill).toEqual({ name: 'Review', content: 'Review {{file}}' })
  })

  it('opens a diagram in the viewer under the snippet name', async () => {
    const { actions } = withContent({ id: 'a', name: 'Flow', language: 'mermaid' }, 'flowchart TD')
    await actions.viewDiagram()
    expect(useUiStore().mermaidView).toMatchObject({ name: 'Flow', code: 'flowchart TD' })
  })

  // The renderer only ever OFFERS a url; main validates the scheme and confirms.
  it('hands the first word of a url snippet to main, and nothing when there is none', async () => {
    const link = withContent(
      { id: 'a', name: 'n', language: 'url' },
      ' https://example.invalid/x \n'
    )
    await link.actions.openUrl()
    expect(api.openLink).toHaveBeenCalledWith('https://example.invalid/x')

    const empty = withContent({ id: 'b', name: 'n', language: 'url' }, '   ')
    await empty.actions.openUrl()
    expect(api.openLink).toHaveBeenCalledTimes(1)
  })

  it('only offers a claude.ai link when the body holds one', async () => {
    const has = withContent(
      { id: 'a', name: 'n', language: 'claude' },
      'see https://claude.ai/chat/abc'
    )
    await has.actions.openLink()
    expect(api.openClaudeLink).toHaveBeenCalledWith('https://claude.ai/chat/abc')

    const none = withContent({ id: 'b', name: 'n', language: 'claude' }, 'no link here')
    await none.actions.openLink()
    expect(api.openClaudeLink).toHaveBeenCalledTimes(1)
  })
})
