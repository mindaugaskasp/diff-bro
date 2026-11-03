import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSnippetRun } from '../../../../src/renderer/src/features/runner/useSnippetRun'
import { useRunnerStore } from '../../../../src/renderer/src/features/runner/runnerStore'

const SCRIPT = ['# totals', 'for x in [1, 2]:', '    print(x)', 'print("end")'].join('\n')

function setup({ language = 'python', secret = false } = {}) {
  const draft = { language: ref(language), content: ref(SCRIPT), secret: ref(secret) }
  const run = useSnippetRun({ tab: { id: 'tab' }, draft, editing: { id: 'snip' } })
  const store = useRunnerStore()
  store.status = { python: { enabled: true }, php: { enabled: false } }
  store.run = vi.fn()
  return { run, store, draft }
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.api = { runStatus: vi.fn(async () => ({})) }
})

describe('useSnippetRun — a line', () => {
  it('offers the lines with code once the language is enabled', () => {
    expect([...setup().run.runnable.value]).toEqual([2, 3, 4])
  })

  it('offers nothing for a secret snippet or a language that is off', () => {
    expect(setup({ secret: true }).run.runnable.value.size).toBe(0)
    expect(setup({ language: 'php' }).run.runnable.value.size).toBe(0)
  })

  it('says how far a press would run', () => {
    expect(setup().run.reachOf(2)).toBe(3)
  })

  it('runs lines 1 to the block end, remembering the line pressed', () => {
    const { run, store } = setup()
    run.startLine(2)
    expect(store.run).toHaveBeenCalledWith('tab', {
      language: 'python',
      code: SCRIPT.split('\n').slice(0, 3).join('\n'),
      snippetId: 'snip',
      line: 2,
      upTo: 3
    })
  })

  it('ignores a press on a line with no code', () => {
    const { run, store } = setup()
    run.startLine(1)
    expect(store.run).not.toHaveBeenCalled()
  })

  it('runs again the way it ran last', () => {
    const { run, store } = setup()
    store.runs.tab = { line: 2 }
    run.again()
    expect(store.run).toHaveBeenLastCalledWith('tab', expect.objectContaining({ line: 2, upTo: 3 }))
    store.runs.tab = { line: null }
    run.again()
    expect(store.run).toHaveBeenLastCalledWith('tab', expect.objectContaining({ code: SCRIPT }))
  })
})
