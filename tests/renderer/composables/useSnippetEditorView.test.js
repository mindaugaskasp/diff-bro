import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useSnippetEditorView } from '../../../src/renderer/src/composables/useSnippetEditorView'

const view = () => useSnippetEditorView({ layout: vi.fn(), toggleReveal: vi.fn() })

describe('useSnippetEditorView', () => {
  it('opens on the rendered view, saved or not', () => {
    expect(view().plain.value).toBe(false)
  })

  it('relayouts Monaco when switched to plain', async () => {
    const layout = vi.fn()
    const v = useSnippetEditorView({ layout, toggleReveal: vi.fn() })
    v.plain.value = true
    await nextTick()
    await nextTick()
    expect(layout).toHaveBeenCalled()
  })
})
