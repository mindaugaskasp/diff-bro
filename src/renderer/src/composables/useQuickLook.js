import { computed, ref, watch } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { SECRET_MASK } from '../utils/secretSnippet'
import { rank, resultRows, snippetRows } from '../utils/quickLook'
import { composeHints, copyKeyLabel, listHints, previewHints } from '../utils/quickLookHints'
import { convertItems } from '../utils/quickLookCommands'
import { useQuickLookKeys } from './useQuickLookKeys'
import { useQuickLookCompose } from './useQuickLookCompose'
import { usePreviewLines } from './usePreviewLines'
import { useQuickLookHandoff } from './useQuickLookHandoff'
import { t } from '../i18n'

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

  const snippetItems = computed(() => snippetRows(snippets.entries, languageOf))

  const toolItems = computed(() => rank(query.value, convertItems(t)))
  // Tools lead the list under one collapsed row, or a long snippet library
  // buries them. A matching query opens the section so search still finds them.
  const toolsOpen = ref(false)
  const results = computed(() =>
    resultRows({
      query: query.value,
      matchedTools: toolItems.value,
      snippets: snippetItems.value,
      toolsOpen: toolsOpen.value
    })
  )
  const current = computed(() => results.value[selected.value] ?? null)
  const toolsIndex = () => results.value.findIndex((r) => r.kind === 'tools')

  watch(query, () => {
    zone.value = 'list'
    const open = query.value.trim() !== '' && toolItems.value.length > 0
    toolsOpen.value = open
    // A tool-matching search lands on the first tool, just past the header.
    selected.value = open ? 1 : 0
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
    // A secret is never decrypted to be previewed — only to be copied.
    if (it.secret) {
      snippetText.value = SECRET_MASK
      return
    }
    const text = await snippets.load(it.id)
    if (current.value?.id === it.id && typeof text === 'string') {
      snippetText.value = text.slice(0, MAX_PREVIEW_CHARS)
    }
  })

  // A convert tool opens the inline panel; a snippet/diff opens in the main
  // window. Convert never raises the app — the whole point of doing it here.
  const convertTool = ref(null) // { id, name, panel } | null
  // Never cleared: keeps the panel mounted (and its input) after you back out.
  const lastTool = ref(null)
  function exitConvert() {
    convertTool.value = null
  }

  // add() pushes onto this window's own entries, so the list updates without a
  // reload; the main window picks it up on its next reload().
  const compose = useQuickLookCompose({ snippets })
  const startCompose = () => compose.open({ name: query.value.trim() })

  function choose(i) {
    const it = results.value[i]
    if (!it) return
    if (it.kind === 'tools') return toggleTools()
    if (it.kind === 'create') return startCompose()
    if (it.kind === 'command') {
      convertTool.value = { id: it.id, name: it.name, panel: it.panel }
      lastTool.value = convertTool.value
      return
    }
    window.api.quickLookOpen({ kind: it.kind, id: it.id })
  }

  const handoff = useQuickLookHandoff({ snippets, results })
  const { closing, copied, copiedName, copiedIndex, copy } = handoff
  const dismiss = () => handoff.animateOut()

  // The preview-line concern (↑/↓ stepping, hover, single-line Shift+Cmd+C copy).
  const preview = usePreviewLines({
    snippetText,
    zone,
    previewEl,
    current,
    onCopied: handoff.confirmLine
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
    handoff.reset()
    convertTool.value = null
    compose.cancel()
  }

  // A textarea handles any text, so the language is not the gate — only tooling
  // the launcher lacks is. A secret is refused because its guarantee is that the
  // contents never render where they can be read.
  const NEEDS_MAIN_WINDOW = new Set(['mermaid', 'claude'])
  const canEditInline = computed(() => {
    const it = current.value
    return it?.kind === 'snippet' && !it.secret && !NEEDS_MAIN_WINDOW.has(it.lang)
  })
  // Loads the FULL body — snippetText here is truncated for preview, and saving
  // that back would amputate anything past MAX_PREVIEW_CHARS.
  async function editCurrent() {
    const it = current.value
    if (!canEditInline.value) return
    const text = await snippets.load(it.id)
    if (typeof text !== 'string') return
    const { id, name, tags, language } = it
    compose.open({ id, name, tags, content: text, language })
  }

  // Rows are [glyph, message id]; utils/ cannot translate, so t() runs here.
  const footHints = computed(() => {
    const rows = compose.composing.value
      ? composeHints()
      : zone.value === 'preview'
        ? previewHints()
        : listHints({ kind: current.value?.kind, toolsOpen: toolsOpen.value })
    return rows.map(([glyph, id]) => [glyph, t(id)])
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
    onNew: startCompose,
    onCollapse: collapseTools,
    // → drills in, mirroring → into a snippet preview.
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
    snippetSpans: preview.snippetSpans,
    lineClass: preview.lineClass,
    hoverLine: preview.hoverLine,
    footHints,
    copyKey: copyKeyLabel,
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
    lastTool,
    exitConvert,
    compose,
    canEditInline,
    editCurrent
  }
}
