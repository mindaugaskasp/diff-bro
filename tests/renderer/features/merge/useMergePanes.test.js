// The wiring between the three editors and the store: which callback the view
// hangs on which editor, and what a theme change or a torn-down container does
// to them. Driven through fakes rather than a real Monaco.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'
import * as monaco from 'monaco-editor'
import { fakeEditor } from './fakeEditor'
import { useMergePanes } from '../../../../src/renderer/src/features/merge/useMergePanes'
import { useMergeStore } from '../../../../src/renderer/src/features/merge/mergeStore'
import { useSettingsStore } from '../../../../src/renderer/src/stores/settingsStore'

const RAW = `head\n<<<<<<< HEAD\nreplicas: 5\n=======\nreplicas: 9\n>>>>>>> feature\ntail\n`

function scene() {
  const made = []
  vi.spyOn(monaco.editor, 'create').mockImplementation((_, options) => {
    const editor = fakeEditor(options.value)
    made.push(editor)
    return editor
  })
  const merge = useMergeStore()
  merge.begin({
    content: RAW,
    ours: 'head\nreplicas: 5\ntail\n',
    theirs: 'head\nreplicas: 9\ntail\n'
  })
  const el = document.createElement('div')
  const containers = { ours: ref(el), result: ref(el), theirs: ref(el) }
  const panes = useMergePanes(containers, merge)
  panes.create()
  const [ours, result, theirs] = made
  return { panes, merge, containers, ours, result, theirs }
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.api = {}
  vi.restoreAllMocks()
})

describe('useMergePanes', () => {
  it('opens three editors with only the middle one writable', () => {
    scene()
    const [ours, result, theirs] = monaco.editor.create.mock.calls.map(([, o]) => o)
    expect([ours.readOnly, result.readOnly, theirs.readOnly]).toEqual([true, false, true])
    // The suggest widget would otherwise eat the Enter meant to be a newline.
    expect(result.acceptSuggestionOnEnter).toBe('off')
  })

  it('creates the editors once, however many times it is asked', () => {
    const { panes } = scene()
    panes.create()
    expect(monaco.editor.create).toHaveBeenCalledTimes(3)
  })

  it('takes a side into the result and settles that region', () => {
    const { panes, merge, result } = scene()
    panes.take(0, 'theirs')
    expect(result.__lines().join('\n')).toContain('replicas: 9')
    expect(merge.regions[0].resolved).toBe(true)
    expect(merge.canSave).toBe(true)
  })

  it('answers every region at once', () => {
    const { panes, merge } = scene()
    panes.takeAll('ours')
    expect(merge.remaining).toBe(0)
  })

  it('follows a chevron clicked in a side pane', () => {
    const { merge, ours } = scene()
    ours.fire('mouse', { target: { type: 2, position: { lineNumber: 2 } } })
    expect(merge.regions[0].resolved).toBe(true)
  })

  it('carries a scroll in one pane to the other two', () => {
    const { ours, result, theirs } = scene()
    ours.fire('scroll')
    expect(result.setScrollTop).toHaveBeenCalledWith(120)
    expect(theirs.setScrollTop).toHaveBeenCalledWith(120)
  })

  // Typing IS the answer where neither side got it right.
  it('takes a hand edit in the result as the answer to the region it lands in', () => {
    const { merge, result } = scene()
    result.setValue('head\nreplicas: 7\ntail\n')
    result.fire('change')
    expect(merge.result).toContain('replicas: 7')
    expect(merge.regions[0].resolved).toBe(true)
  })

  it('reveals a region and puts the caret on it', () => {
    const { panes, result } = scene()
    panes.reveal(0)
    expect(result.revealLineInCenter).toHaveBeenCalledWith(2)
  })

  it('writes a side back into its pane when the store replaces it', async () => {
    const { merge, ours } = scene()
    merge.ours = 'rewritten\n'
    await nextTick()
    expect(ours.getValue()).toBe('rewritten\n')
  })

  // The scrollbar marks are baked colours, so a theme change has to repaint.
  it('re-applies the theme and repaints', async () => {
    scene()
    const setTheme = vi.spyOn(monaco.editor, 'setTheme')
    useSettingsStore().theme = 'dark'
    await nextTick()
    expect(setTheme).toHaveBeenCalled()
  })

  it('disposes every editor when its container goes away', async () => {
    const { containers, ours, result, theirs } = scene()
    containers.result.value = null
    await nextTick()
    for (const editor of [ours, result, theirs]) expect(editor.dispose).toHaveBeenCalled()
  })
})
