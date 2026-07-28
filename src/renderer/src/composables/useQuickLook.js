import { computed, ref, watch } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { useVaultStore } from '../stores/vaultStore'
import { rank } from '../utils/quickLook'
import { useQuickLookKeys } from './useQuickLookKeys'
import { useCopyFeedback } from './useCopyFeedback'

// State for the floating quick look-up: merge snippets + active saved diffs into
// one searchable list (utils/quickLook ranks it), decrypt the selected SNIPPET
// for an inline preview, and hand a chosen result to the main window. Diffs
// preview from their metadata only and open into the comparison view — the
// launcher stays lightweight (no Monaco/Mermaid) so a summon is instant.

const MAX_PREVIEW_CHARS = 4000
const extOf = (name) => /\.([a-z0-9]+)$/i.exec(name ?? '')?.[1]?.toLowerCase() ?? ''

export function useQuickLook() {
  const snippets = useSnippetStore()
  const vault = useVaultStore()
  const query = ref('')
  const selected = ref(0)
  const snippetText = ref('')

  // Both libraries, newest-first, normalized to QuickLookItem.
  const items = computed(() => [
    ...snippets.entries
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((e) => {
        const lang = languageOf(e)
        return {
          kind: 'snippet',
          id: e.id,
          name: e.name,
          tags: e.tags ?? [],
          lang: lang === 'plaintext' ? '' : lang
        }
      }),
    ...vault.active.map((e) => ({
      kind: 'diff',
      id: e.id,
      name: e.name,
      tags: e.tags ?? [],
      lang: extOf(e.name)
    }))
  ])

  const results = computed(() => rank(query.value, items.value))
  const current = computed(() => results.value[selected.value] ?? null)
  // Metadata for a selected diff's preview (no decryption — diffs open into the
  // main window rather than rendering their content here).
  const diffMeta = computed(() => {
    const it = current.value
    if (it?.kind !== 'diff') return null
    const e = vault.entries.find((x) => x.id === it.id)
    return e ? { expiresAt: e.expiresAt, from: e.from, favorite: e.favorite } : null
  })

  // A shorter list resets the highlight to the top.
  watch(results, () => {
    selected.value = 0
  })

  // Decrypt the selected snippet for preview. Guarded by id so a fast arrow
  // sweep never renders a stale decrypt; non-strings (key error / dropped) show
  // nothing.
  watch(current, async (it) => {
    snippetText.value = ''
    if (it?.kind !== 'snippet') return
    const text = await snippets.load(it.id)
    if (current.value?.id === it.id && typeof text === 'string') {
      snippetText.value = text.slice(0, MAX_PREVIEW_CHARS)
    }
  })

  function choose(i) {
    const it = results.value[i]
    if (it) window.api.quickLookOpen({ kind: it.kind, id: it.id })
  }

  // Dismiss elegantly: the OS `hide()` is instant, so we fade+scale the card out
  // in the renderer first (the window is transparent, so this reads as the
  // launcher vanishing), then hide once the animation has played. `closing`
  // drives the CSS; it's reset after hiding so the next summon opens clean.
  const CLOSE_ANIM_MS = 160
  const closing = ref(false)
  function animateOut() {
    if (closing.value) return
    closing.value = true
    setTimeout(() => {
      window.api.quickLookHide()
      closing.value = false
    }, CLOSE_ANIM_MS)
  }
  const dismiss = () => animateOut()

  // Copy the selected snippet's FULL contents (the preview text is truncated) to
  // the OS clipboard via the main process — never navigator.clipboard, which the
  // deny-all permission handler blocks. Diffs have no single copyable body in
  // this lightweight launcher, so copy is snippet-only; a diff opens instead.
  // Copy is "grab and go": flash the cue, then auto-dismiss the launcher.
  const HIDE_AFTER_COPY_MS = 650
  const { copied, flash } = useCopyFeedback()
  async function copy(i) {
    const it = results.value[i]
    if (it?.kind !== 'snippet') return
    const text = await snippets.load(it.id)
    if (typeof text !== 'string') return
    const res = await window.api.copyText(text)
    if (!res?.ok) return
    flash()
    setTimeout(animateOut, HIDE_AFTER_COPY_MS)
  }

  // Each summon: re-read both libraries from disk (separate Pinia instance) and
  // reset the search.
  function refresh() {
    snippets.reload()
    vault.reload()
    query.value = ''
    selected.value = 0
    snippetText.value = ''
    closing.value = false // a fresh summon is never mid-close
  }

  const { onKeydown } = useQuickLookKeys({
    count: () => results.value.length,
    selected,
    onChoose: choose,
    onDismiss: dismiss,
    onCopy: copy
  })

  return {
    query,
    selected,
    results,
    current,
    diffMeta,
    snippetText,
    choose,
    copy,
    copied,
    closing,
    dismiss,
    refresh,
    onKeydown
  }
}
