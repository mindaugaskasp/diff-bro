import { onBeforeUnmount, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'

const LEAVE_GRACE_MS = 120

/** @returns {import('../../types').RunGutterSpot} where the line's number sits on screen */
function spotFor(editor, line, reach) {
  const box = editor.getDomNode().getBoundingClientRect()
  const layout = editor.getLayoutInfo()
  return {
    line,
    reach,
    top: box.top + editor.getTopForLineNumber(line) - editor.getScrollTop(),
    left: box.left + layout.lineNumbersLeft,
    width: layout.lineNumbersWidth,
    height: editor.getOption(monaco.editor.EditorOption.lineHeight)
  }
}

/**
 * The play button that takes the hovered line's number while that line can run.
 * @param {{ editorInstance: () => object|null, ready: import('vue').Ref<boolean>, run: object }} o
 */
export function useRunGutter({ editorInstance, ready, run }) {
  const spot = ref(null)
  let subscriptions = []
  let onButton = false
  let timer = null

  const hide = () => (spot.value = null)
  function onMove(e) {
    const line = e.target?.position?.lineNumber
    if (line && run.runnable.value.has(line)) {
      spot.value = spotFor(editorInstance(), line, run.reachOf(line))
    } else if (!onButton) hide()
  }
  function onLeave() {
    clearTimeout(timer)
    timer = setTimeout(() => onButton || hide(), LEAVE_GRACE_MS)
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

  watch(ready, (on) => (on ? attach() : (detach(), hide())), { immediate: true })
  onBeforeUnmount(detach)

  return {
    spot,
    enter: () => (onButton = true),
    leave: () => {
      onButton = false
      hide()
    },
    press: () => spot.value && run.startLine(spot.value.line)
  }
}
