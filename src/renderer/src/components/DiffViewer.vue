<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useDiffStore } from '../stores/diffStore'
import { makeSearch } from '../composables/useDiffSearch'

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

  leftModel?.dispose()
  rightModel?.dispose()
  leftModel = monaco.editor.createModel(left.text, left.language)
  rightModel = monaco.editor.createModel(right.text, right.language)
  editor.setModel({ original: leftModel, modified: rightModel })
  // Re-apply any active queries to the new content.
  leftSearch.run()
  rightSearch.run()
}

onMounted(() => {
  editor = monaco.editor.createDiffEditor(container.value, {
    theme: store.theme === 'light' ? 'vs' : 'vs-dark',
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
    const changes = editor.getLineChanges() ?? []
    let additions = 0
    let deletions = 0
    for (const c of changes) {
      if (c.modifiedEndLineNumber > 0)
        additions += c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1
      if (c.originalEndLineNumber > 0)
        deletions += c.originalEndLineNumber - c.originalStartLineNumber + 1
    }
    store.stats = { additions, deletions }
  })
  setModels()
})

watch(() => [store.left, store.right], setModels)
watch(() => [leftSearch.query, leftSearch.isRegex], leftSearch.run)
watch(() => [rightSearch.query, rightSearch.isRegex], rightSearch.run)
watch(
  () => [store.renderSideBySide, store.ignoreTrimWhitespace],
  ([split, ignoreWs]) => {
    editor?.updateOptions({ renderSideBySide: split, ignoreTrimWhitespace: ignoreWs })
  }
)
watch(
  () => store.theme,
  (theme) => monaco.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark')
)

onBeforeUnmount(() => {
  leftModel?.dispose()
  rightModel?.dispose()
  editor?.dispose()
})
</script>

<template>
  <div class="diff-viewer">
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
        <input
          v-model="s.ref.query"
          type="search"
          class="search-input"
          :class="{ error: s.ref.error }"
          :placeholder="`Search ${s.label} side…`"
          spellcheck="false"
          @keyup.enter="s.ref.step(1)"
          @keyup.escape="s.ref.query = ''"
        />
        <label class="regex" title="Regular expression">
          <input v-model="s.ref.isRegex" type="checkbox" />
          .*
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
          title="Previous match"
          @click="s.ref.step(-1)"
        >
          ‹
        </button>
        <button class="nav" :disabled="!s.ref.matchCount" title="Next match" @click="s.ref.step(1)">
          ›
        </button>
      </div>
    </div>
    <div ref="container" class="diff-container"></div>
  </div>
</template>

<style scoped src="./styles/DiffViewer.css"></style>
<!-- Global (unscoped): Monaco owns the DOM these rules target. -->
<style src="./styles/DiffViewer.global.css"></style>
