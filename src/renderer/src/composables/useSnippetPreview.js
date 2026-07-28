import { onBeforeUnmount, ref, watch } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'

// Hover preview: decrypt on demand, debounced (only the row the pointer settles
// on costs a vault:decrypt), briefly cached. Renders via interpolation, never v-html.
const HOVER_DELAY_MS = 180
const MAX_PREVIEW_CHARS = 4000
const CARD_WIDTH = 640

/**
 * @returns {{ preview: import('vue').Ref<import('../types').SnippetPreview|null>,
 *            onRowEnter: (entry: import('../types').SnippetEntry, e: MouseEvent) => void,
 *            onRowLeave: () => void }}
 */
export function useSnippetPreview() {
  const store = useSnippetStore()
  const diff = useDiffStore()
  const preview = ref(null) // { id, name, tags, lang, text, style }
  const cache = new Map()
  let hoverTimer = null
  let closeTimer = null
  let pendingId = null

  // Just outside the sidebar, clamped so a tall card never runs off the bottom.
  function cardStyle(row) {
    const r = row.getBoundingClientRect()
    const gap = 8
    let left = r.right + gap
    if (left + CARD_WIDTH > window.innerWidth - 8) left = Math.max(8, r.left - CARD_WIDTH - gap)
    const reserve = Math.min(480, window.innerHeight - 16)
    const top = Math.min(r.top, window.innerHeight - reserve)
    return { left: `${left}px`, top: `${Math.max(8, top)}px` }
  }

  async function onRowEnter(entry, e) {
    clearTimeout(hoverTimer)
    clearTimeout(closeTimer)
    const row = e.currentTarget
    hoverTimer = setTimeout(async () => {
      pendingId = entry.id
      let text = cache.get(entry.id)
      if (text === undefined) {
        text = await store.load(entry.id)
        if (text == null) return // key unavailable / dropped — no preview
        cache.set(entry.id, text)
      }
      if (pendingId !== entry.id) return // pointer already moved on
      const lang = languageOf(entry)
      preview.value = {
        id: entry.id,
        name: entry.name,
        tags: entry.tags,
        // plaintext is the boring default — no badge for it.
        lang: lang === 'plaintext' ? '' : lang,
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
    if (!preview.value) return
    const { id, name } = preview.value
    preview.value = null
    const code = await store.load(id)
    if (code != null) diff.openMermaid(name, code)
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
