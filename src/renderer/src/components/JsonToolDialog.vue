<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { formatJson, validateJson } from '../utils/textFormats'

const store = useDiffStore()
const snippets = useSnippetStore()

function addToSnippets() {
  snippets.startNewSnippetFrom(input.value, 'json')
  close()
}
const container = ref(null)
const input = ref('')
let editor = null

// Recomputed on every keystroke via the editor's change event below — cheap
// (JSON.parse), and drives both the status line and Monaco's own inline
// error squiggle (the json.worker wired in monaco-setup.js does that part
// automatically once the model's language is 'json').
const status = computed(() => (input.value.trim() ? validateJson(input.value) : null))
const statusText = computed(() => {
  if (!status.value) return ''
  if (status.value.valid) return 'Valid JSON'
  const loc = status.value.line ? ` (line ${status.value.line}, column ${status.value.column})` : ''
  return `Invalid${loc}: ${status.value.error}`
})

onMounted(() => {
  editor = monaco.editor.create(container.value, {
    value: input.value,
    language: 'json',
    theme: store.theme === 'light' ? 'vs' : 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 12.5
  })
  editor.onDidChangeModelContent(() => {
    input.value = editor.getValue()
  })
})

// Keep the editor in sync when `format()` rewrites `input` programmatically.
watch(input, (value) => {
  if (editor && editor.getValue() !== value) editor.setValue(value)
})
watch(
  () => store.theme,
  (theme) => monaco.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark')
)

onBeforeUnmount(() => {
  editor?.dispose()
})

function format() {
  if (status.value?.valid) input.value = formatJson(input.value)
}

async function copy() {
  await navigator.clipboard.writeText(input.value)
  store.showNotice('Copied to clipboard.')
}

function close() {
  store.showJsonToolDialog = false
}
</script>

<template>
  <div class="backdrop">
    <div class="dialog">
      <div class="dialog-header">
        <h3>JSON Format / Validate</h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>
      <div ref="container" class="editor"></div>
      <p v-if="status" class="status" :class="{ valid: status.valid, invalid: !status.valid }">
        {{ statusText }}
      </p>
      <div class="actions">
        <button class="primary" :disabled="!status?.valid" @click="format">Format</button>
        <button class="ghost" :disabled="!input" @click="copy">Copy</button>
        <button class="ghost" :disabled="!input" @click="addToSnippets">Add to Snippets</button>
        <button class="ghost" @click="close">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  width: 560px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
h3 {
  margin: 0;
  font-size: 14px;
}
.close-x {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 20px;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
}
.close-x:hover {
  color: var(--text);
}
.editor {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  height: 280px;
}
.status {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}
.status.valid {
  color: #3fb950;
}
.status.invalid {
  color: var(--danger-bg);
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.primary {
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 600;
}
.primary:disabled {
  opacity: 0.4;
  cursor: default;
}
.ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 12px;
  cursor: pointer;
}
.ghost:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
