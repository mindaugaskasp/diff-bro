import { useSnippetStore } from '../stores/snippetStore'
import { useUiStore } from '../stores/uiStore'
import { useDiffStore } from '../stores/diffStore'
import { useCopyFeedback } from './useCopyFeedback'
import { parseTemplateVars } from '../utils/templateVars'
import { t } from '../i18n'

// The hover card's actions, split from useSnippetPreview (which owns the
// open/close timing) so each half stays inside its size cap.
/**
 * @param {object} args
 * @param {import('vue').Ref<import('../types').SnippetPreview|null>} args.preview
 * @param {() => void} args.dismiss
 */
export function useSnippetPreviewActions({ preview, dismiss }) {
  const store = useSnippetStore()
  const ui = useUiStore()

  // Open the hovered snippet in the full editor (its enlarged, editable window).
  function openEditor() {
    if (preview.value) store.editingSnippet = { id: preview.value.id }
    dismiss()
  }

  // Reload the full source (the preview text is truncated) for the viewer.
  async function openDiagram() {
    if (!preview.value || preview.value.secret) return
    const { id, name } = preview.value
    dismiss()
    const code = await store.load(id)
    if (code != null) ui.openMermaid(name, code)
  }

  // Copy from the card — the moment "is this the one?" was just answered. The
  // FULL contents (the card's text is truncated for display); a Claude prompt
  // with placeholders routes through the fill dialog, like the row's copy.
  const { copied, flash } = useCopyFeedback()
  async function copyPreview() {
    const card = preview.value
    if (!card) return
    const content = await store.load(card.id)
    if (content == null) return
    if (card.lang === 'claude' && parseTemplateVars(content).length) {
      store.pendingFill = { name: card.name, content }
      return dismiss()
    }
    const res = await window.api.copyText(content)
    // Same failure voice as the row's copy — silent was a second behaviour.
    if (res?.ok) flash()
    else useDiffStore().showNotice(t('snippetRow.copyFailed'))
  }

  return { openEditor, openDiagram, copied, copyPreview }
}
