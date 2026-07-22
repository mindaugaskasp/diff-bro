import { onBeforeUnmount, ref, watch } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'

// Hover preview for a snippet row: decrypt on demand, debounced, briefly cached.
// Snippets are encrypted at rest, so a preview costs a vault:decrypt — the delay
// means only the row the pointer settles on is decrypted, not every row it
// sweeps past. Contents render through text interpolation only, never v-html.
const HOVER_DELAY_MS = 350
const MAX_PREVIEW_CHARS = 4000
const CARD_WIDTH = 320

/**
 * @returns {{ preview: import('vue').Ref<import('../types').SnippetPreview|null>,
 *            onRowEnter: (entry: import('../types').SnippetEntry, e: MouseEvent) => void,
 *            onRowLeave: () => void }}
 */
export function useSnippetPreview() {
  const store = useSnippetStore()
  const preview = ref(null) // { id, name, tags, lang, text, style }
  const cache = new Map()
  let hoverTimer = null
  let pendingId = null

  // Place the card just outside the sidebar, clamped to the viewport.
  function cardStyle(row) {
    const r = row.getBoundingClientRect()
    const gap = 8
    let left = r.right + gap
    if (left + CARD_WIDTH > window.innerWidth - 8) left = Math.max(8, r.left - CARD_WIDTH - gap)
    const top = Math.min(r.top, window.innerHeight - 230)
    return { left: `${left}px`, top: `${Math.max(8, top)}px` }
  }

  async function onRowEnter(entry, e) {
    clearTimeout(hoverTimer)
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
  function onRowLeave() {
    clearTimeout(hoverTimer)
    pendingId = null
    preview.value = null
  }

  // The editor is the ONLY path that mutates snippet content, so dropping the
  // cache when it closes is sufficient invalidation. If a future feature can
  // change a snippet's content without opening the editor, it must clear this
  // cache too, or previews will go stale.
  watch(
    () => store.editingSnippet,
    (v) => {
      if (!v) cache.clear()
    }
  )
  onBeforeUnmount(() => clearTimeout(hoverTimer))

  return { preview, onRowEnter, onRowLeave }
}
