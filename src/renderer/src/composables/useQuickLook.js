import { computed, ref, watch } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { rank } from '../utils/quickLook'
import { convertItems } from '../utils/quickLookCommands'
import { isMac } from '../keys'
import { useQuickLookKeys } from './useQuickLookKeys'
import { usePreviewLines } from './usePreviewLines'
import { useCopyFeedback } from './useCopyFeedback'

// State for the floating quick look-up. The launcher stays lightweight (no
// Monaco/Mermaid) so a summon is instant — it lists snippets and the inline
// convert tools only; diffs stay in the main window.

const MAX_PREVIEW_CHARS = 4000

export function useQuickLook() {
  const snippets = useSnippetStore()
  const query = ref('')
  const selected = ref(0)
  const snippetText = ref('')
  // 'list' navigates results; 'preview' scrolls the active snippet body.
  const zone = ref('list')
  const previewEl = ref(null)

  const snippetItems = computed(() =>
    snippets.entries
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
      })
  )

  const toolItems = computed(() => rank(query.value, convertItems()))
  // The convert tools live under a single collapsible "Tools" row so browsing
  // snippets stays compact; a query that matches a tool opens the section so
  // search still surfaces them.
  const toolsOpen = ref(false)
  const results = computed(() => {
    const snips = rank(query.value, snippetItems.value)
    const tools = toolItems.value
    if (!tools.length) return snips
    const header = { kind: 'tools', id: '__tools__', name: 'Tools', count: tools.length }
    return toolsOpen.value ? [...snips, header, ...tools] : [...snips, header]
  })
  const current = computed(() => results.value[selected.value] ?? null)
  const toolsIndex = () => results.value.findIndex((r) => r.kind === 'tools')

  watch(query, () => {
    zone.value = 'list'
    const open = query.value.trim() !== '' && toolItems.value.length > 0
    toolsOpen.value = open
    // A tool-matching search lands on the first tool (past the header); browsing
    // starts at the top of the list.
    selected.value = open ? rank(query.value, snippetItems.value).length + 1 : 0
  })
  // Collapsing shrinks the list — clamp the selection, but never yank it to the
  // top the way a fresh query does.
  watch(results, () => {
    if (selected.value >= results.value.length) {
      selected.value = Math.max(0, results.value.length - 1)
    }
  })

  function toggleTools() {
    toolsOpen.value = !toolsOpen.value
    if (!toolsOpen.value) selected.value = toolsIndex()
  }
  // ← / Escape from the expanded section closes it and parks on the header.
  function collapseTools() {
    if (!toolsOpen.value) return false
    toolsOpen.value = false
    selected.value = toolsIndex()
    return true
  }

  const canEnterPreview = () => current.value?.kind === 'snippet' && !!previewEl.value

  // Guarded by id so a fast arrow sweep never renders a stale decrypt.
  watch(current, async (it) => {
    snippetText.value = ''
    zone.value = 'list' // a new (or diff) selection can't stay in snippet-scroll
    preview.reset()
    if (it?.kind !== 'snippet') return
    const text = await snippets.load(it.id)
    if (current.value?.id === it.id && typeof text === 'string') {
      snippetText.value = text.slice(0, MAX_PREVIEW_CHARS)
    }
  })

  // A convert tool opens the inline panel; a snippet/diff opens in the main
  // window. Convert never raises the app — the whole point of doing it here.
  const convertTool = ref(null) // { id, name, panel } | null
  function exitConvert() {
    convertTool.value = null
  }

  function choose(i) {
    const it = results.value[i]
    if (!it) return
    if (it.kind === 'tools') return toggleTools()
    if (it.kind === 'command') {
      convertTool.value = { id: it.id, name: it.name, panel: it.panel }
      return
    }
    window.api.quickLookOpen({ kind: it.kind, id: it.id })
  }

  // Fade the card out (the window is transparent) before the OS hide, so the
  // launcher vanishes smoothly rather than blinking out.
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

  // Full contents (the preview is truncated), via the main process —
  // navigator.clipboard is blocked by the deny-all permission handler.
  const HIDE_AFTER_COPY_MS = 900
  const { copied, flash } = useCopyFeedback()
  // The just-copied snippet's name + its row index, so the confirmation names
  // what was taken and the "Copied" cue can animate on that exact row.
  const copiedName = ref('')
  const copiedIndex = ref(-1)
  async function copy(i) {
    const it = results.value[i]
    if (it?.kind !== 'snippet') return
    const text = await snippets.load(it.id)
    if (typeof text !== 'string') return
    const res = await window.api.copyText(text)
    if (!res?.ok) return
    copiedName.value = it.name
    copiedIndex.value = i
    flash()
    setTimeout(animateOut, HIDE_AFTER_COPY_MS)
  }

  // The preview-line concern (↑/↓ stepping, hover, single-line Shift+Cmd+C copy).
  // onCopied reuses the same copy feedback the whole-snippet copy shows.
  const preview = usePreviewLines({
    snippetText,
    zone,
    previewEl,
    current,
    onCopied: (name) => {
      copiedName.value = name
      copiedIndex.value = -1
      flash()
      setTimeout(animateOut, HIDE_AFTER_COPY_MS)
    }
  })

  // Separate Pinia instance from the main window — re-read the snippet library on
  // each summon to reflect changes made there.
  function refresh() {
    snippets.reload()
    query.value = ''
    selected.value = 0
    snippetText.value = ''
    zone.value = 'list'
    toolsOpen.value = false
    preview.reset()
    copiedName.value = ''
    copiedIndex.value = -1
    closing.value = false
    convertTool.value = null
  }

  const copyKey = isMac ? '⌘C' : 'Ctrl+C'
  const copyLineKey = isMac ? '⇧⌘C' : 'Ctrl+Shift+C'
  const footHints = computed(() => {
    if (zone.value === 'preview') {
      return [
        ['↑↓', 'line'],
        [copyLineKey, 'copy line'],
        ['←', 'back to list'],
        ['↵', 'open'],
        ['Esc', 'back']
      ]
    }
    const hints = [['↑↓', 'navigate']]
    const kind = current.value?.kind
    if (kind === 'snippet') hints.push(['→', 'scroll preview'])
    else if (kind === 'command') hints.push(['→', 'convert'])
    else if (kind === 'tools') hints.push(['→', toolsOpen.value ? 'collapse' : 'browse tools'])
    hints.push(['↵', 'open'], [copyKey, 'copy'], ['Esc', 'close'])
    return hints
  })

  const { onKeydown } = useQuickLookKeys({
    count: () => results.value.length,
    selected,
    zone,
    canEnterPreview,
    movePreview: preview.movePreview,
    onChoose: choose,
    onDismiss: dismiss,
    onCopy: copy,
    onCopyLine: preview.copyLine,
    onCollapse: collapseTools,
    // → drills in: a command opens its convert panel, the Tools row expands and
    // moves onto the first tool — mirroring → into a snippet preview.
    onExpand: () => {
      const it = current.value
      if (it?.kind === 'tools') {
        toolsOpen.value = true
        selected.value += 1
        return true
      }
      if (it?.kind === 'command') {
        choose(selected.value)
        return true
      }
      return false
    }
  })

  return {
    query,
    selected,
    results,
    current,
    toolsOpen,
    snippetLines: preview.snippetLines,
    lineClass: preview.lineClass,
    hoverLine: preview.hoverLine,
    footHints,
    copyKey,
    zone,
    previewEl,
    choose,
    copy,
    copied,
    copiedName,
    copiedIndex,
    closing,
    dismiss,
    refresh,
    onKeydown,
    convertTool,
    exitConvert
  }
}
