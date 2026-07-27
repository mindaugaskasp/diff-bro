import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useDiffStore } from '../stores/diffStore'
import { isDarkTheme } from '../utils/themes'

// A Monaco editor bound to a `content` ref: two-way value sync, live language
// switching, and the app theme mirrored into the editor. Callers own the ref, so
// the editor is just another view of it.
/**
 * @param {object} args
 * @param {import('vue').Ref<HTMLElement|null>} args.container  element to mount into
 * @param {import('vue').Ref<string>} args.content              two-way bound text
 * @param {import('vue').Ref<string>} args.language             Monaco language id
 * @param {object} [args.options]                               extra editor options
 * @returns {{ ready: import('vue').Ref<boolean>, reset: (value?: string) => void, applySelectionEdit: (transform: (m: {text: string, start: number, end: number}) => ({text: string, start: number, end: number}|null)) => void, layout: () => void }}
 */
export function useMonacoInput({ container, content, language, readOnly, options = {} }) {
  const diff = useDiffStore()
  const ready = ref(false)
  let editor = null

  const monacoTheme = () => (isDarkTheme(diff.theme) ? 'vs-dark' : 'vs')
  // `readOnly` may be a ref (view/edit mode) or absent; read it either way.
  const isReadOnly = () => (readOnly ? !!readOnly.value : false)

  onMounted(() => {
    editor = monaco.editor.create(container.value, {
      value: content.value,
      language: language.value,
      theme: monacoTheme(),
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      contextmenu: false,
      fontSize: 12.5,
      readOnly: isReadOnly(),
      ...options
    })
    editor.onDidChangeModelContent(() => {
      content.value = editor.getValue()
    })
    ready.value = true
  })

  watch(content, (value) => {
    if (editor && editor.getValue() !== value) editor.setValue(value)
  })
  watch(language, (lang) => {
    if (editor) monaco.editor.setModelLanguage(editor.getModel(), lang)
  })
  if (readOnly) watch(readOnly, (ro) => editor?.updateOptions({ readOnly: !!ro }))
  watch(
    () => diff.theme,
    () => monaco.editor.setTheme(monacoTheme())
  )
  onBeforeUnmount(() => editor?.dispose())

  // Replace the content and put the caret back where the user is working.
  function reset(value = '') {
    content.value = value
    editor?.setValue(value)
    editor?.focus()
  }

  // Run a pure (whole text + selection offsets) → (new text + new selection)
  // transform against the editor, as one undo step, then restore the selection
  // and focus. The transform owns the string work (see utils/jiraMarkup.js); this
  // just bridges Monaco's line/column selection to flat offsets and back.
  function applySelectionEdit(transform) {
    if (!editor) return
    const model = editor.getModel()
    const sel = editor.getSelection()
    const start = model.getOffsetAt(sel.getStartPosition())
    const end = model.getOffsetAt(sel.getEndPosition())
    const result = transform({ text: model.getValue(), start, end })
    if (!result) return
    editor.pushUndoStop()
    editor.executeEdits('toolbar', [{ range: model.getFullModelRange(), text: result.text }])
    editor.pushUndoStop()
    editor.setSelection(
      monaco.Selection.fromPositions(model.getPositionAt(result.start), model.getPositionAt(result.end))
    )
    editor.focus()
  }

  // Force a re-layout. Needed when the editor was created in a hidden container
  // (e.g. the snippet editor opens on the rendered Jira view) and is then shown.
  function layout() {
    editor?.layout()
  }

  return { ready, reset, applySelectionEdit, layout }
}
