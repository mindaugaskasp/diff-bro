import { onBeforeUnmount, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { applyMonacoTheme, MONACO_THEME } from '../../composables/useMonacoTheme'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  remember,
  repaint,
  resolveTouched,
  reveal as revealRegion,
  seedRegions,
  SIDES,
  syncScroll,
  takeLayout,
  writeChoice
} from './mergePaneOps'

const BASE_OPTIONS = {
  theme: MONACO_THEME,
  automaticLayout: true,
  minimap: { enabled: false },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  scrollbar: { useShadows: false },
  scrollBeyondLastLine: false,
  contextmenu: false,
  fontSize: 12.5,
  // No completions while resolving a merge: the suggest widget offers words from
  // the file itself, which is noise here — and it swallows the Enter that was
  // meant to be a newline.
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: 'off',
  acceptSuggestionOnEnter: 'off',
  parameterHints: { enabled: false }
}

const makeEditor = (el, value, readOnly) =>
  monaco.editor.create(el, { ...BASE_OPTIONS, value, readOnly })

function build({ containers, merge, editors, sync, onScroll, onEdit }) {
  for (const side of SIDES) {
    const isResult = side === 'result'
    editors[side] = makeEditor(
      containers[side].value,
      isResult ? merge.result : merge[side],
      !isResult
    )
    editors[side].onDidScrollChange(() => {
      syncScroll(editors, side, sync)
      onScroll()
    })
  }
  // The reader typing IS the answer where neither side got it right.
  editors.result.onDidChangeModelContent(() => {
    const text = editors.result.getValue()
    if (text !== merge.result) merge.result = text
    onEdit()
  })
}

/**
 * The three editors, their scroll sync and the conflict decorations.
 *
 * Panes align by SCROLL POSITION, not line for line: the sides are whole files
 * whose lines stop corresponding to the result's the moment a region is
 * resolved, and pretending otherwise would drift as the reader works.
 *
 * @param {{ours: object, result: object, theirs: object}} containers template refs
 * @param {object} merge the merge store
 */
export function useMergePanes(containers, merge) {
  const settings = useSettingsStore()
  const editors = { ours: null, result: null, theirs: null }
  const sync = { busy: false }
  const anchors = { ours: [], theirs: [] }
  const settled = []
  // The take buttons are DOM over the editor, so their positions are state the
  // template renders rather than decorations Monaco keeps. One ref, so the
  // template unwraps it.
  const takes = ref({ ours: [], theirs: [] })
  let ids = {}

  function create() {
    if (editors.result || !containers.result.value) return
    applyMonacoTheme(settings.theme)
    build({ containers, merge, editors, sync, onScroll: place, onEdit })
    seedRegions({ editors, merge, ids, settled })
    paint()
  }

  const place = () => {
    takes.value = {
      ours: takeLayout({ editors, anchors, merge, key: 'ours' }),
      theirs: takeLayout({ editors, anchors, merge, key: 'theirs' })
    }
  }

  const paint = () => {
    repaint({ editors, merge, ids, anchors })
    place()
  }
  const onEdit = () => resolveTouched({ editors, merge, ids, settled })
  const reveal = (index) => revealRegion({ editors, ids, index })

  const take = (index, choice) => {
    writeChoice({ editors, merge, ids, index, choice })
    remember({ editors, ids, settled })
    paint()
  }

  const takeAll = (choice) => merge.regions.forEach((_, i) => take(i, choice))

  function destroy() {
    for (const side of SIDES) {
      editors[side]?.dispose()
      editors[side] = null
    }
    ids = {}
  }

  bind({ containers, merge, settings, editors, paint, create, destroy })
  onBeforeUnmount(destroy)

  return { create, reveal, take, takeAll, takes }
}

// The watchers, out of the factory so it stays inside the size cap.
function bind({ containers, merge, settings, editors, paint, create, destroy }) {
  watch(
    () => merge.result,
    (text) => {
      if (editors.result && editors.result.getValue() !== text) editors.result.setValue(text)
      paint()
    }
  )
  watch([() => merge.ours, () => merge.theirs], () => {
    editors.ours?.setValue(merge.ours)
    editors.theirs?.setValue(merge.theirs)
  })
  watch(() => merge.at, paint)
  watch(
    () => settings.theme,
    (theme) => {
      applyMonacoTheme(theme)
      // The scrollbar marks are baked colours, so they do not re-tint themselves.
      paint()
    }
  )
  watch(containers.result, (el) => (el ? create() : destroy()))
}
