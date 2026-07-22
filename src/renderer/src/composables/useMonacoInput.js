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
 * @returns {{ ready: import('vue').Ref<boolean>, reset: (value?: string) => void }}
 */
export function useMonacoInput({ container, content, language, options = {} }) {
  const diff = useDiffStore()
  const ready = ref(false)
  let editor = null

  const monacoTheme = () => (isDarkTheme(diff.theme) ? 'vs-dark' : 'vs')

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

  return { ready, reset }
}
