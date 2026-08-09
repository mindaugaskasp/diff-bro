import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useSettingsStore } from '../stores/settingsStore'
import { MONACO_THEME, applyMonacoTheme } from './useMonacoTheme'

// A Monaco editor bound to a `content` ref: two-way sync, live language switching,
// theme mirrored in.
/**
 * @param {object} args
 * @param {import('vue').Ref<HTMLElement|null>} args.container  element to mount into
 * @param {import('vue').Ref<string>} args.content              two-way bound text
 * @param {import('vue').Ref<string>} args.language             Monaco language id
 * @param {object} [args.options]                               extra editor options
 * @returns {{ ready: import('vue').Ref<boolean>, reset: (value?: string) => void, applySelectionEdit: (transform: (m: {text: string, start: number, end: number}) => ({text: string, start: number, end: number}|null)) => void, layout: () => void }}
 */
export function useMonacoInput({ container, content, language, readOnly, options = {} }) {
  const settings = useSettingsStore()
  const ready = ref(false)
  let editor = null

  // `readOnly` may be a ref (view/edit mode) or absent; read it either way.
  const isReadOnly = () => (readOnly ? !!readOnly.value : false)

  // Created against whatever container is present, and re-created if one appears
  // later: a secret snippet unmounts the editor entirely rather than hiding it,
  // so the plaintext is not sitting in the DOM behind a display:none.
  function createEditor() {
    if (editor || !container.value) return
    // Defined before the editor exists: the option below only NAMES it.
    applyMonacoTheme(settings.theme)
    editor = monaco.editor.create(container.value, {
      value: content.value,
      language: language.value,
      theme: MONACO_THEME,
      automaticLayout: true,
      minimap: { enabled: false },
      // No right-hand overview-ruler lane: with the minimap off it only paints a
      // stock-theme border that reads as a white sliver against the app surface.
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollbar: { useShadows: false },
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
  }

  function destroyEditor() {
    editor?.dispose()
    editor = null
    ready.value = false
  }

  onMounted(createEditor)
  watch(container, (el) => (el ? createEditor() : destroyEditor()))

  watch(content, (value) => {
    if (editor && editor.getValue() !== value) editor.setValue(value)
  })
  watch(language, (lang) => {
    if (editor) monaco.editor.setModelLanguage(editor.getModel(), lang)
  })
  if (readOnly) watch(readOnly, (ro) => editor?.updateOptions({ readOnly: !!ro }))
  // post-flush, because applyMonacoTheme probes the LIVE palette off the
  // document — a pre-flush watcher reads the theme the app is leaving.
  watch(() => settings.theme, applyMonacoTheme, { flush: 'post' })
  onBeforeUnmount(destroyEditor)

  // Replace the content and put the caret back where the user is working.
  function reset(value = '') {
    content.value = value
    editor?.setValue(value)
    editor?.focus()
  }

  // Bridge Monaco's line/column selection to flat offsets, run a pure transform
  // as one undo step, then restore the selection.
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
      monaco.Selection.fromPositions(
        model.getPositionAt(result.start),
        model.getPositionAt(result.end)
      )
    )
    editor.focus()
  }

  // Re-layout after the editor was created in a hidden container and then shown.
  function layout() {
    editor?.layout()
  }

  return { ready, reset, applySelectionEdit, layout }
}
