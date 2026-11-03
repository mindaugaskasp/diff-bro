import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSnippetRun } from '../../../../src/renderer/src/features/runner/useSnippetRun'
import { useRunnerStore } from '../../../../src/renderer/src/features/runner/runnerStore'

vi.mock('monaco-editor', () => ({ editor: { EditorOption: { lineHeight: 'lineHeight' } } }))

const SCRIPT = ['# totals', 'for x in [1, 2]:', '    print(x)', 'print("end")'].join('\n')

function setup({ language = 'python', secret = false } = {}) {
  const draft = { language: ref(language), content: ref(SCRIPT), secret: ref(secret) }
  const snippetRun = useSnippetRun({
    tab: { id: 'tab' },
    draft,
    editing: { id: 'snip' },
    editorInstance: () => null,
    ready: ref(false)
  })
  const store = useRunnerStore()
  store.status = { python: { enabled: true }, php: { enabled: false } }
  store.start = vi.fn()
  return { snippetRun, store }
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.api = { runStatus: vi.fn(async () => ({})) }
})

describe('useSnippetRun — a line', () => {
  it('offers the lines with code once the language is enabled', () => {
    expect([...setup().snippetRun.runnableLines.value]).toEqual([2, 3, 4])
  })

  it('offers nothing for a secret snippet or a language that is off', () => {
    expect(setup({ secret: true }).snippetRun.runnableLines.value.size).toBe(0)
    expect(setup({ language: 'php' }).snippetRun.runnableLines.value.size).toBe(0)
  })

  it('says how far a press would run', () => {
    expect(setup().snippetRun.lastLineFor(2)).toBe(3)
  })

  it('runs lines 1 to the block end, remembering the line pressed', () => {
    const { snippetRun, store } = setup()
    snippetRun.startLine(2)
    expect(store.start).toHaveBeenCalledWith('tab', {
      language: 'python',
      code: SCRIPT.split('\n').slice(0, 3).join('\n'),
      snippetId: 'snip',
      line: 2,
      lastLine: 3
    })
  })

  it('ignores a press on a line with no code', () => {
    const { snippetRun, store } = setup()
    snippetRun.startLine(1)
    expect(store.start).not.toHaveBeenCalled()
  })

  it('runs again the way it ran last', () => {
    const { snippetRun, store } = setup()
    store.runs.tab = { line: 2 }
    snippetRun.runAgain()
    expect(store.start).toHaveBeenLastCalledWith(
      'tab',
      expect.objectContaining({ line: 2, lastLine: 3 })
    )
    store.runs.tab = { line: null }
    snippetRun.runAgain()
    expect(store.start).toHaveBeenLastCalledWith('tab', expect.objectContaining({ code: SCRIPT }))
  })
})
