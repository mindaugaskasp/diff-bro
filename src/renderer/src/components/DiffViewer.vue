<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useDiffStore } from '../stores/diffStore'
import { makeSearch, SEARCH_OPTIONS } from '../composables/useDiffSearch'
import { isDarkTheme } from '../utils/themes'
import { diffLineStats } from '../utils/diffStats'
import { monacoDiffScroller, setDiffScroller } from '../utils/diffScroller'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()
const container = ref(null)

let editor = null
let leftModel = null
let rightModel = null
let origDecos = null
let modDecos = null

const leftSearch = makeSearch(
  () => leftModel,
  () => editor?.getOriginalEditor(),
  () => origDecos
)
const rightSearch = makeSearch(
  () => rightModel,
  () => editor?.getModifiedEditor(),
  () => modDecos
)

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
  // Re-apply any active queries to the new content.
  leftSearch.run()
  rightSearch.run()
}

onMounted(() => {
  editor = monaco.editor.createDiffEditor(container.value, {
    theme: isDarkTheme(store.theme) ? 'vs-dark' : 'vs',
    automaticLayout: true,
    readOnly: true,
    originalEditable: false,
    renderSideBySide: store.renderSideBySide,
    ignoreTrimWhitespace: store.ignoreTrimWhitespace,
    scrollBeyondLastLine: false,
    contextmenu: false,
    minimap: { enabled: false }
  })
  origDecos = editor.getOriginalEditor().createDecorationsCollection([])
  modDecos = editor.getModifiedEditor().createDecorationsCollection([])
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
  () => [leftSearch.query, leftSearch.isRegex, leftSearch.matchCase, leftSearch.wholeWord],
  leftSearch.run
)
watch(
  () => [rightSearch.query, rightSearch.isRegex, rightSearch.matchCase, rightSearch.wholeWord],
  rightSearch.run
)
watch(
  () => [store.renderSideBySide, store.ignoreTrimWhitespace],
  ([split, ignoreWs]) => {
    editor?.updateOptions({ renderSideBySide: split, ignoreTrimWhitespace: ignoreWs })
  }
)
watch(
  () => store.theme,
  (theme) => monaco.editor.setTheme(isDarkTheme(theme) ? 'vs-dark' : 'vs')
)

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
      <span>No differences — both sides are identical</span>
    </div>
    <div class="search">
      <div
        v-for="s in [
          { ref: leftSearch, label: 'left' },
          { ref: rightSearch, label: 'right' }
        ]"
        :key="s.label"
        class="side"
      >
        <span class="side-label">{{ s.label }}</span>
        <div class="search-box" :class="{ error: s.ref.error }">
          <AppIcon class="search-glyph" name="search" />
          <input
            v-model="s.ref.query"
            type="search"
            class="search-input"
            :placeholder="`Search ${s.label} side…`"
            spellcheck="false"
            @keyup.enter="s.ref.step(1)"
            @keyup.escape="s.ref.query = ''"
          />
        </div>
        <label
          v-for="o in SEARCH_OPTIONS"
          :key="o.key"
          class="opt"
          :data-tip="o.tip"
          :aria-label="o.label"
        >
          <input v-model="s.ref[o.key]" type="checkbox" />
          {{ o.glyph }}
        </label>
        <span class="count">
          <template v-if="s.ref.error">bad regex</template>
          <template v-else-if="s.ref.query && s.ref.matchCount"
            >{{ s.ref.currentIndex }}/{{ s.ref.matchCount }}</template
          >
          <template v-else-if="s.ref.query">none</template>
        </span>
        <button
          class="nav"
          :disabled="!s.ref.matchCount"
          data-tip="Jump to the previous match"
          aria-label="Previous match"
          @click="s.ref.step(-1)"
        >
          <AppIcon name="chevron-left" />
        </button>
        <button
          class="nav"
          :disabled="!s.ref.matchCount"
          data-tip="Jump to the next match (or press Enter in the box)"
          aria-label="Next match"
          @click="s.ref.step(1)"
        >
          <AppIcon name="chevron-right" />
        </button>
      </div>
    </div>
    <div ref="container" class="diff-container"></div>
  </div>
</template>

<style scoped src="./styles/DiffViewer.css"></style>
<!-- Global (unscoped): Monaco owns the DOM these rules target. -->
<style src="./styles/DiffViewer.global.css"></style>
