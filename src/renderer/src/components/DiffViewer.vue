<script setup>
import { onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useDiffStore } from '../stores/diffStore'

const store = useDiffStore()
const container = ref(null)

let editor = null
let leftModel = null
let rightModel = null
let origDecos = null
let modDecos = null

// Each side searches only its own model, with its own query, match count, and
// navigation — the left and right panes are independent.
function makeSearch(getModel, getSubEditor, getDecos) {
  const state = reactive({
    query: '',
    isRegex: false,
    matchCount: 0,
    currentIndex: 0,
    error: false
  })
  let matches = []

  function clear() {
    matches = []
    state.matchCount = 0
    state.currentIndex = 0
    getDecos()?.set([])
  }
  function apply() {
    getDecos()?.set(
      matches.map((range, i) => ({
        range,
        options: {
          className: i === state.currentIndex - 1 ? 'dv-find-current' : 'dv-find-match',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      }))
    )
  }
  function reveal(idx) {
    const range = matches[idx]
    if (range) getSubEditor()?.revealRangeInCenterIfOutsideViewport(range)
  }
  function run() {
    state.error = false
    const model = getModel()
    if (!state.query || !model) return clear()
    try {
      // findMatches(search, searchScope, isRegex, matchCase, wordSeparators, captureMatches)
      matches = model
        .findMatches(state.query, false, state.isRegex, false, null, false)
        .map((m) => m.range)
    } catch {
      state.error = true
      matches = []
    }
    state.matchCount = matches.length
    state.currentIndex = matches.length ? 1 : 0
    apply()
    if (matches.length) reveal(0)
  }
  function step(delta) {
    if (!state.matchCount) return
    state.currentIndex =
      ((state.currentIndex - 1 + delta + state.matchCount) % state.matchCount) + 1
    apply()
    reveal(state.currentIndex - 1)
  }
  return Object.assign(state, { run, step })
}

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

<style scoped>
.diff-viewer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.search {
  display: flex;
  gap: 10px;
  padding: 6px 10px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
}
.side {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
}
.side-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-hint);
}
.search-input {
  flex: 1;
  min-width: 0;
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
  font-size: 11px;
  color: var(--text-dim);
  min-width: 48px;
  text-align: right;
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
