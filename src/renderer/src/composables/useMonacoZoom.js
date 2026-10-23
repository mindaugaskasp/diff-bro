import { watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useUiStore } from '../stores/uiStore'
import { zoomedPx } from '../utils/diffZoom'

/**
 * Keeps an editor on the shared code-text zoom. Monaco's resting size is
 * platform-specific, so it is read back once from the editor rather than assumed.
 * @returns {{ attach: (editor: object, fontSource?: object) => void, detach: () => void }}
 */
export function useMonacoZoom() {
  const ui = useUiStore()
  let target = null
  let base = 0
  const apply = () => base && target?.updateOptions({ fontSize: zoomedPx(base, ui.diffZoom) })
  watch(() => ui.diffZoom, apply)
  return {
    attach(editor, fontSource = editor) {
      target = editor
      base = fontSource.getOption(monaco.editor.EditorOption.fontInfo).fontSize
      apply()
    },
    detach: () => (target = null)
  }
}
