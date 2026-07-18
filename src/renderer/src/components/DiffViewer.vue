<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useDiffStore } from '../stores/diffStore'

const store = useDiffStore()
const container = ref(null)

let editor = null
let leftModel = null
let rightModel = null

function setModels() {
  const left = store.leftComparable
  const right = store.rightComparable
  if (!left || !right || !editor) return

  leftModel?.dispose()
  rightModel?.dispose()
  leftModel = monaco.editor.createModel(left.text, left.language)
  rightModel = monaco.editor.createModel(right.text, right.language)
  editor.setModel({ original: leftModel, modified: rightModel })
}

onMounted(() => {
  editor = monaco.editor.createDiffEditor(container.value, {
    theme: 'vs-dark',
    automaticLayout: true,
    readOnly: true,
    originalEditable: false,
    renderSideBySide: store.renderSideBySide,
    ignoreTrimWhitespace: store.ignoreTrimWhitespace,
    scrollBeyondLastLine: false,
    minimap: { enabled: false }
  })
  editor.onDidUpdateDiff(() => {
    const changes = editor.getLineChanges() ?? []
    let additions = 0
    let deletions = 0
    for (const c of changes) {
      if (c.modifiedEndLineNumber > 0) additions += c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1
      if (c.originalEndLineNumber > 0) deletions += c.originalEndLineNumber - c.originalStartLineNumber + 1
    }
    store.stats = { additions, deletions }
  })
  setModels()
})

watch(() => [store.left, store.right], setModels)
watch(
  () => [store.renderSideBySide, store.ignoreTrimWhitespace],
  ([split, ignoreWs]) => {
    editor?.updateOptions({ renderSideBySide: split, ignoreTrimWhitespace: ignoreWs })
  }
)

onBeforeUnmount(() => {
  leftModel?.dispose()
  rightModel?.dispose()
  editor?.dispose()
})
</script>

<template>
  <div ref="container" class="diff-container"></div>
</template>

<style scoped>
.diff-container {
  width: 100%;
  height: 100%;
}
</style>
