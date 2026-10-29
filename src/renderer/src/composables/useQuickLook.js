import { computed, ref, watch } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { rank, resultRows, snippetRows } from '../utils/quickLook'
import { convertItems } from '../utils/quickLookCommands'
import { useQuickLookKeys } from './useQuickLookKeys'
import { useQuickLookCompose } from './useQuickLookCompose'
import { useQuickLookHandoff } from './useQuickLookHandoff'
import { t } from '../i18n'

// State for the floating quick look-up. The launcher stays lightweight (no
// Monaco/Mermaid) so a summon is instant — it lists snippets and the inline
// convert tools only; diffs stay in the main window.

export function useQuickLook() {
  const snippets = useSnippetStore()
  const query = ref('')
  const selected = ref(0)

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
  const compose = useQuickLookCompose({ snippets, current })
  const startCompose = () => compose.open({ name: query.value.trim() })

  const openInApp = (it) => window.api.quickLookOpen({ kind: it.kind, id: it.id })

  // A secret or a main-window-only language opens in the main window instead.
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
    if (it.kind === 'snippet' && compose.canEdit.value) return compose.editCurrent()
    openInApp(it)
  }

  async function openFromSheet() {
    const unsaved = compose.dirty.value || !compose.editing.value
    const id = unsaved ? await compose.save() : compose.editingId.value
    if (id) openInApp({ kind: 'snippet', id })
  }

  function open(i) {
    const it = results.value[i]
    if (it && (it.kind === 'snippet' || it.kind === 'diff')) openInApp(it)
  }

  const handoff = useQuickLookHandoff({ snippets, results })
  const { closing, copied, copiedName, copiedIndex, copy } = handoff
  const dismiss = () => handoff.animateOut()

  // Separate Pinia instance from the main window — re-read the snippet library on
  // each summon to reflect changes made there.
  //
  // A summon is otherwise a fresh start, EXCEPT where the card holds work: a
  // draft mid-sentence or a tool panel mid-conversion. Two presses of the chord
  // in a row is how the launcher is dismissed and brought back, and it used to
  // throw both away.
  function refresh() {
    snippets.reload()
    if (compose.dirty.value || convertTool.value) return
    query.value = ''
    selected.value = 0
    toolsOpen.value = false
    handoff.reset()
    convertTool.value = null
    compose.cancel()
  }

  const { onKeydown } = useQuickLookKeys({
    count: () => results.value.length,
    selected,
    onChoose: choose,
    onDismiss: dismiss,
    onCopy: copy,
    onOpen: open,
    onNew: startCompose,
    // → drills into the tools section, or into a tool.
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
    choose,
    open,
    openFromSheet,
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
    compose
  }
}
