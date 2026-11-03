import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useRunGutter } from '../../../../src/renderer/src/features/runner/useRunGutter'

vi.mock('monaco-editor', () => ({ editor: { EditorOption: { lineHeight: 'lineHeight' } } }))

function fakeEditor() {
  const handlers = {}
  const on = (name) => (fn) => {
    handlers[name] = fn
    return { dispose: vi.fn() }
  }
  return {
    handlers,
    onMouseMove: on('move'),
    onMouseLeave: on('leave'),
    onDidScrollChange: on('scroll'),
    getDomNode: () => ({ getBoundingClientRect: () => ({ top: 100, left: 300 }) }),
    getLayoutInfo: () => ({ lineNumbersLeft: 4, lineNumbersWidth: 20 }),
    getTopForLineNumber: (n) => (n - 1) * 19,
    getScrollTop: () => 0,
    getOption: () => 19
  }
}

const hover = (editor, line) =>
  editor.handlers.move({ target: { position: line && { lineNumber: line } } })

let editor, run, ready, gutter
beforeEach(async () => {
  vi.useFakeTimers()
  editor = fakeEditor()
  ready = ref(false)
  run = { runnable: ref(new Set([2, 3])), reachOf: (n) => n + 1, startLine: vi.fn() }
  gutter = useRunGutter({ editorInstance: () => editor, ready, run })
  ready.value = true
  await nextTick()
})
afterEach(() => vi.useRealTimers())

describe('useRunGutter', () => {
  it('sits on the hovered line number when that line can run', () => {
    hover(editor, 2)
    expect(gutter.spot.value).toEqual({
      line: 2,
      reach: 3,
      top: 119,
      left: 304,
      width: 20,
      height: 19
    })
  })

  it('shows nothing on a line that cannot run', () => {
    hover(editor, 1)
    expect(gutter.spot.value).toBeNull()
  })

  it('stays while the pointer moves from the line onto the button', () => {
    hover(editor, 2)
    editor.handlers.leave()
    gutter.enter()
    vi.advanceTimersByTime(500)
    expect(gutter.spot.value).not.toBeNull()
    gutter.leave()
    expect(gutter.spot.value).toBeNull()
  })

  it('goes once the pointer leaves the editor', () => {
    hover(editor, 2)
    editor.handlers.leave()
    vi.advanceTimersByTime(500)
    expect(gutter.spot.value).toBeNull()
  })

  it('goes when the editor scrolls', () => {
    hover(editor, 2)
    editor.handlers.scroll()
    expect(gutter.spot.value).toBeNull()
  })

  it('runs the line it sits on', () => {
    hover(editor, 3)
    gutter.press()
    expect(run.startLine).toHaveBeenCalledWith(3)
  })
})
