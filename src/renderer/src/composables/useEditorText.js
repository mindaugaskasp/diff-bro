import { watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useUiStore } from '../stores/uiStore'
import { useEditorFontStore } from '../stores/editorFontStore'
import { zoomedPx } from '../utils/diffZoom'
import { fontStack } from '../utils/editorFonts'

/**
 * Keeps an editor on the shared code-text zoom and the chosen typeface.
 * Without `basePx`, Monaco's platform-specific resting size is read back once.
 * @param {{ basePx?: number }} [opts]
 * @returns {{ attach: (editor: object, fontSource?: object) => void, detach: () => void }}
 */
export function useEditorText({ basePx } = {}) {
  const ui = useUiStore()
  const fonts = useEditorFontStore()
  let target = null
  let base = 0

  const size = () => (basePx ? basePx * ui.diffZoom : zoomedPx(base, ui.diffZoom))
  const face = () => fontStack(fonts.family)
  const applySize = () => base && target?.updateOptions({ fontSize: size() })
  function applyFace() {
    if (!target) return
    target.updateOptions({
      fontFamily: face() || monaco.editor.EditorOptions.fontFamily.defaultValue
    })
    monaco.editor.remeasureFonts()
  }

  watch(() => ui.diffZoom, applySize)
  watch(() => fonts.family, applyFace)

  return {
    attach(editor, fontSource = editor) {
      target = editor
      base = basePx ?? fontSource.getOption(monaco.editor.EditorOption.fontInfo).fontSize
      target.updateOptions({ fontSize: size(), ...(face() ? { fontFamily: face() } : {}) })
    },
    detach: () => (target = null)
  }
}
