<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useDiffStore } from '../stores/diffStore'

const store = useDiffStore()
const container = ref(null)

let editor = null
let leftModel = null
let rightModel = null

// --- Search state ---
const query = ref('')
const isRegex = ref(false)
const matchCount = ref(0)
const currentIndex = ref(0) // 1-based; 0 = none
const searchError = ref(false)
let matches = [] // [{ side: 'original' | 'modified', range }]
let origDecos = null
let modDecos = null

function subEditor(side) {
  return side === 'original' ? editor.getOriginalEditor() : editor.getModifiedEditor()
}

function clearMatches() {
  matches = []
  matchCount.value = 0
  currentIndex.value = 0
  origDecos?.set([])
  modDecos?.set([])
}

function runSearch() {
  if (!editor || !leftModel || !rightModel) return
  searchError.value = false
  const q = query.value
  if (!q) {
    clearMatches()
    return
  }
  const collect = (model, side) => {
    try {
      // findMatches(search, searchScope, isRegex, matchCase, wordSeparators, captureMatches)
      return model
        .findMatches(q, false, isRegex.value, false, null, false)
        .map((m) => ({ side, range: m.range }))
    } catch {
      searchError.value = true
      return []
    }
  }
  matches = [...collect(leftModel, 'original'), ...collect(rightModel, 'modified')]
  matchCount.value = matches.length
  currentIndex.value = matches.length ? 1 : 0
  applyDecorations()
  if (matches.length) reveal(0)
}

function applyDecorations() {
  const build = (side) =>
    matches
      .map((m, i) =>
        m.side === side
          ? {
              range: m.range,
              options: {
                className: i === currentIndex.value - 1 ? 'dv-find-current' : 'dv-find-match',
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
              }
            }
          : null
      )
      .filter(Boolean)
  origDecos?.set(build('original'))
  modDecos?.set(build('modified'))
}

function reveal(idx) {
  const m = matches[idx]
  if (!m) return
  subEditor(m.side).revealRangeInCenterIfOutsideViewport(m.range)
}

function step(delta) {
  if (!matchCount.value) return
  currentIndex.value = ((currentIndex.value - 1 + delta + matchCount.value) % matchCount.value) + 1
  applyDecorations()
  reveal(currentIndex.value - 1)
}

function setModels() {
  const left = store.leftComparable
  const right = store.rightComparable
  if (!left || !right || !editor) return

  leftModel?.dispose()
  rightModel?.dispose()
  leftModel = monaco.editor.createModel(left.text, left.language)
  rightModel = monaco.editor.createModel(right.text, right.language)
  editor.setModel({ original: leftModel, modified: rightModel })
  runSearch() // re-apply an active query to the new content
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
watch([query, isRegex], runSearch)
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
      <input
        v-model="query"
        type="search"
        class="search-input"
        :class="{ error: searchError }"
        placeholder="Search both sides…"
        spellcheck="false"
        @keyup.enter="step(1)"
        @keyup.escape="query = ''"
      />
      <label class="regex" title="Regular expression">
        <input v-model="isRegex" type="checkbox" />
        .*
      </label>
      <span class="count">
        <template v-if="searchError">bad regex</template>
        <template v-else-if="query && matchCount">{{ currentIndex }}/{{ matchCount }}</template>
        <template v-else-if="query">no matches</template>
      </span>
      <button class="nav" :disabled="!matchCount" title="Previous match" @click="step(-1)">
        ‹
      </button>
      <button class="nav" :disabled="!matchCount" title="Next match" @click="step(1)">›</button>
    </div>
    <div ref="container" class="diff-container"></div>
  </div>
</template>

<style scoped>
.diff-viewer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: var(--bg-panel);
}
.search-input {
  flex: 1;
  min-width: 0;
  max-width: 380px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 4px 8px;
  font-size: 12.5px;
}
.search-input:focus {
  outline: none;
  border-color: var(--accent);
}
.search-input.error {
  border-color: var(--danger-bg);
}
.regex {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--text-dim);
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  cursor: pointer;
}
.count {
  font-size: 11.5px;
  color: var(--text-dim);
  min-width: 64px;
  font-variant-numeric: tabular-nums;
}
.nav {
  background: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 1px 8px;
}
.nav:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.nav:disabled {
  opacity: 0.35;
  cursor: default;
}
.diff-container {
  width: 100%;
  flex: 1;
  min-height: 0;
}
</style>

<!-- Global (unscoped): Monaco renders match decorations into its own DOM,
     which scoped styles can't reach. -->
<style>
.dv-find-match {
  background: rgba(210, 153, 34, 0.35);
}
.dv-find-current {
  background: rgba(210, 153, 34, 0.75);
}
</style>
