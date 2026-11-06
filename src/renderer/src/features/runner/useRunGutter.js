import { onBeforeUnmount, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'

const LEAVE_GRACE_MS = 120

/** @returns {import('../../types').RunGutterSpot} where the line's number sits on screen */
function spotFor(editor, line, range) {
  const box = editor.getDomNode().getBoundingClientRect()
  const layout = editor.getLayoutInfo()
  return {
    line,
    ...range,
    top: box.top + editor.getTopForLineNumber(line) - editor.getScrollTop(),
    left: box.left + layout.lineNumbersLeft,
    width: layout.lineNumbersWidth,
    height: editor.getOption(monaco.editor.EditorOption.lineHeight)
  }
}

/**
 * The play button that takes the hovered line's number while that line can run.
 * @param {object} o
 * @param {() => object|null} o.editorInstance
 * @param {import('vue').Ref<boolean>} o.ready
 * @param {import('vue').Ref<Set<number>>} o.runnableLines
 * @param {(line: number) => import('../../types').LineRange|null} o.lineRangeFor
 * @param {(line: number) => void} o.startLine
 */
export function useRunGutter({ editorInstance, ready, runnableLines, lineRangeFor, startLine }) {
  const spot = ref(null)
  let subscriptions = []
  let isPointerOnButton = false
  let timer = null

  const hide = () => (spot.value = null)
  function onMove(e) {
    const line = e.target?.position?.lineNumber
    if (line && runnableLines.value.has(line)) {
      spot.value = spotFor(editorInstance(), line, lineRangeFor(line))
    } else if (!isPointerOnButton) hide()
  }
  function onLeave() {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (!isPointerOnButton) hide()
    }, LEAVE_GRACE_MS)
  }
  function detach() {
    subscriptions.forEach((s) => s.dispose())
    subscriptions = []
    clearTimeout(timer)
  }
  function attach() {
    const editor = editorInstance()
    if (!editor) return
    subscriptions = [
      editor.onMouseMove(onMove),
      editor.onMouseLeave(onLeave),
      editor.onDidScrollChange(hide)
    ]
  }

  watch(
    ready,
    (isReady) => {
      if (isReady) return attach()
      detach()
      hide()
    },
    { immediate: true }
  )
  onBeforeUnmount(detach)

  return {
    spot,
    enter: () => (isPointerOnButton = true),
    leave: () => {
      isPointerOnButton = false
      hide()
    },
    press: () => {
      if (spot.value) startLine(spot.value.line)
    }
  }
}
