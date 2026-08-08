import { onBeforeUnmount, ref, watch } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { SECRET_MASK, isSecret } from '../utils/secretSnippet'
import { useUiStore } from '../stores/uiStore'
import { previewCardPosition } from '../utils/previewPlacement'

// Hover preview: decrypt on demand, debounced (only the row the pointer settles
// on costs a vault:decrypt), briefly cached. Renders via interpolation, never v-html.
const HOVER_DELAY_MS = 180
const MAX_PREVIEW_CHARS = 4000
// Twice the old 640: the preview is for READING a snippet, and the placement
// util narrows it to whatever the row leaves rather than overlapping the list.
const CARD = { width: 1280, minWidth: 360 }

/**
 * @returns {{ preview: import('vue').Ref<import('../types').SnippetPreview|null>,
 *            onRowEnter: (entry: import('../types').SnippetEntry, e: MouseEvent) => void,
 *            onRowLeave: () => void }}
 */
export function useSnippetPreview() {
  const store = useSnippetStore()
  const ui = useUiStore()
  const preview = ref(null) // { id, name, tags, lang, text, style }
  const cache = new Map()
  let hoverTimer = null
  let closeTimer = null
  let pendingId = null

  const cardStyle = (row) =>
    previewCardPosition({
      rect: row.getBoundingClientRect(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      ...CARD
    })

  async function onRowEnter(entry, e) {
    clearTimeout(hoverTimer)
    clearTimeout(closeTimer)
    // Anchored to the whole row: against the title alone the card landed on
    // top of the row's own buttons.
    const row = e.currentTarget.closest?.('[data-preview-anchor]') ?? e.currentTarget
    hoverTimer = setTimeout(async () => {
      pendingId = entry.id
      // A secret is never decrypted for a preview at all — the plaintext has no
      // reason to exist here, so it never reaches the cache or the card.
      let text = SECRET_MASK
      if (!isSecret(entry)) {
        text = cache.get(entry.id)
        if (text === undefined) {
          text = await store.load(entry.id)
          if (text == null) return // key unavailable / dropped — no preview
          cache.set(entry.id, text)
        }
      }
      if (pendingId !== entry.id) return // pointer already moved on
      const lang = languageOf(entry)
      preview.value = {
        id: entry.id,
        name: entry.name,
        tags: entry.tags,
        // plaintext is the boring default — no badge for it.
        lang: lang === 'plaintext' ? '' : lang,
        secret: isSecret(entry),
        text: text.slice(0, MAX_PREVIEW_CHARS),
        style: cardStyle(row)
      }
    }, HOVER_DELAY_MS)
  }
  // Short close delay so the pointer can travel into the card (onCardEnter cancels).
  function onRowLeave() {
    clearTimeout(hoverTimer)
    pendingId = null
    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => (preview.value = null), 160)
  }
  const onCardEnter = () => clearTimeout(closeTimer)
  function onCardLeave() {
    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => (preview.value = null), 90)
  }
  // Open the hovered snippet in the full editor (its enlarged, editable window).
  function openEditor() {
    if (preview.value) store.editingSnippet = { id: preview.value.id }
    preview.value = null
  }
  // Reload the full source (the preview text is truncated) for the viewer.
  async function openDiagram() {
    if (!preview.value || preview.value.secret) return
    const { id, name } = preview.value
    preview.value = null
    const code = await store.load(id)
    if (code != null) ui.openMermaid(name, code)
  }

  // The editor is the only path that mutates content, so dropping the cache when
  // it closes is sufficient invalidation.
  watch(
    () => store.editingSnippet,
    (v) => {
      if (!v) cache.clear()
    }
  )
  onBeforeUnmount(() => {
    clearTimeout(hoverTimer)
    clearTimeout(closeTimer)
  })

  return { preview, onRowEnter, onRowLeave, onCardEnter, onCardLeave, openEditor, openDiagram }
}
