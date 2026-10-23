import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useSettingsStore } from '../stores/settingsStore'
import { useMonacoZoom } from './useMonacoZoom'
import { applyMonacoTheme } from './useMonacoTheme'
import { diffEditorOptions } from '../utils/diffEditorOptions'
import { diffLineStats } from '../utils/diffStats'

// A read-only inline Monaco diff bound to two text refs — the history dialog's
// pane. DiffViewer keeps its own heavier wiring (views, zoom, navigation);
// this is deliberately just "show what changed between two strings".
/**
 * @param {object} args
 * @param {import('vue').Ref<HTMLElement|null>} args.container
 * @param {import('vue').Ref<string>} args.original
 * @param {import('vue').Ref<string>} args.modified
 * @param {import('vue').Ref<string>} args.language  Monaco language id
 * @returns {{ stats: import('vue').Ref<{ additions: number, deletions: number }|null> }}
 */
export function useMonacoDiffPane({ container, original, modified, language }) {
  const settings = useSettingsStore()
  const zoom = useMonacoZoom()
  let editor = null
  const stats = ref(null)
  let models = null

  const disposeModels = () => {
    models?.original.dispose()
    models?.modified.dispose()
    models = null
  }

  function setModels() {
    if (!editor) return
    const lang = language?.value || 'plaintext'
    const next = {
      original: monaco.editor.createModel(original.value, lang),
      modified: monaco.editor.createModel(modified.value, lang)
    }
    editor.setModel(next)
    disposeModels()
    models = next
  }

  function create() {
    if (editor || !container.value) return
    applyMonacoTheme(settings.theme)
    editor = monaco.editor.createDiffEditor(
      container.value,
      // Side by side only when the resizable panel is wide enough for two readable panes.
      diffEditorOptions({
        renderSideBySide: true,
        ignoreTrimWhitespace: false,
        wrap: true,
        inlineBelow: 640
      })
    )
    zoom.attach(editor, editor.getModifiedEditor())
    editor.onDidUpdateDiff(() => (stats.value = diffLineStats(editor.getLineChanges())))
    setModels()
  }

  onMounted(create)
  // The container unmounts while a secret is masked — same rule as the editor:
  // plaintext never sits in the DOM behind a display:none.
  watch(container, (el) => {
    if (el) return create()
    editor?.dispose()
    editor = null
    disposeModels()
  })
  watch([original, modified], setModels)
  onBeforeUnmount(() => {
    editor?.dispose()
    editor = null
    disposeModels()
  })
  return { stats }
}
