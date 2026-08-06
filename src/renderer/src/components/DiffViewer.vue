<script setup>
// Searching a pane is Monaco's own find widget (Cmd/Ctrl+F), not a bar of our
// own: it is already per-pane, already collapsed until asked for, and already
// carries the case/word/regex toggles, the match count and the navigation the
// hand-rolled row duplicated above the diff.
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useDiffStore } from '../stores/diffStore'
import { isDarkTheme } from '../utils/themes'
import { diffEditorOptions } from '../utils/diffEditorOptions'
import { zoomedPx } from '../utils/diffZoom'
import { diffLineStats } from '../utils/diffStats'
import { monacoDiffScroller, setDiffScroller } from '../utils/diffScroller'
import AppIcon from './AppIcon.vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'

const store = useDiffStore()

const settings = useSettingsStore()
const ui = useUiStore()
let baseFont = 0
const applyZoom = (zoom) =>
  baseFont && editor?.updateOptions({ fontSize: zoomedPx(baseFont, zoom) })
const container = ref(null)

let editor = null
let leftModel = null
let rightModel = null

function setModels() {
  const left = store.leftComparable
  const right = store.rightComparable
  if (!left || !right || !editor) return

  const prevLeft = leftModel
  const prevRight = rightModel
  leftModel = monaco.editor.createModel(left.text, left.language)
  rightModel = monaco.editor.createModel(right.text, right.language)
  editor.setModel({ original: leftModel, modified: rightModel })
  // Dispose OLD models only AFTER setModel switched — an attached model throws.
  prevLeft?.dispose()
  prevRight?.dispose()
}

onMounted(() => {
  editor = monaco.editor.createDiffEditor(
    container.value,
    diffEditorOptions({
      dark: isDarkTheme(settings.theme),
      renderSideBySide: store.renderSideBySide,
      ignoreTrimWhitespace: store.ignoreTrimWhitespace
    })
  )
  // Monaco's default size is platform-specific, so the resting size is whatever
  // it just chose — read once, before any zoom has moved it.
  baseFont = editor.getModifiedEditor().getOption(monaco.editor.EditorOption.fontInfo).fontSize
  applyZoom(ui.diffZoom)
  editor.onDidUpdateDiff(() => {
    const stats = diffLineStats(editor.getLineChanges())
    store.stats = stats
    // Monaco fires this once before its worker has returned anything; that is
    // not a diff to report, to call identical, or to photograph.
    if (stats) store.diffRevision++
  })
  setDiffScroller(monacoDiffScroller(() => editor))
  setModels()
})

watch(() => [store.left, store.right], setModels)
watch(
  () => [store.renderSideBySide, store.ignoreTrimWhitespace],
  ([split, ignoreWs]) => {
    editor?.updateOptions({ renderSideBySide: split, ignoreTrimWhitespace: ignoreWs })
  }
)
watch(
  () => settings.theme,
  (theme) => monaco.editor.setTheme(isDarkTheme(theme) ? 'vs-dark' : 'vs')
)
watch(() => ui.diffZoom, applyZoom)

onBeforeUnmount(() => {
  setDiffScroller(null)
  // Editor first (releases its models); disposing attached models throws.
  editor?.dispose()
  leftModel?.dispose()
  rightModel?.dispose()
})
</script>

<template>
  <div class="diff-viewer">
    <!-- Identical sides: a label over the panes says so. -->
    <div v-if="store.identical" class="identical-row">
      <AppIcon name="check" class="ok" />
      <span>{{ $t('diffViewer.noDifferencesBothSidesAre') }}</span>
    </div>
    <div ref="container" class="diff-container"></div>
    <!-- The same band the diagram diff carries, in the same words: what changed
         reads alike whichever kind of comparison you are looking at. -->
    <div v-if="store.stats && !store.identical" class="status-band">
      <span>
        {{ $t('diffViewer.lines') }}
        <span class="add">{{ $t('count.added', store.stats.additions) }}</span> ·
        <span class="del">{{ $t('count.removed', store.stats.deletions) }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped src="./styles/DiffViewer.css"></style>
<!-- Global (unscoped): Monaco owns the DOM these rules target. -->
<style src="./styles/DiffViewer.global.css"></style>
