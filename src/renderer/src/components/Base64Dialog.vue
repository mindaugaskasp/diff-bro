<script setup>
import { ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { base64Decode, base64Encode } from '../utils/base64'
import { useFileTextDrop } from '../composables/useFileDrop'

const store = useDiffStore()
const snippets = useSnippetStore()
const input = ref('')
const { onDropFile } = useFileTextDrop((text) => {
  input.value = text
})
const output = ref('')
const error = ref(null)

function addToSnippets() {
  snippets.startNewSnippetFrom(output.value || input.value, 'auto')
  close()
}

function encode() {
  error.value = null
  output.value = base64Encode(input.value)
}

function decode() {
  error.value = null
  try {
    output.value = base64Decode(input.value)
  } catch {
    output.value = ''
    error.value = 'Not valid Base64 (or not valid UTF-8 once decoded).'
  }
}

function useOutputAsInput() {
  input.value = output.value
  output.value = ''
  error.value = null
}

async function copyOutput() {
  await navigator.clipboard.writeText(output.value)
  store.showNotice('Copied to clipboard.')
}

function close() {
  store.showBase64Dialog = false
}
</script>

<template>
  <div class="backdrop">
    <div class="dialog">
      <div class="dialog-header">
        <h3>Base64 Encode / Decode</h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>
      <label>
        Input
        <textarea
          v-model="input"
          spellcheck="false"
          placeholder="Text or Base64… (or drop a file here)"
          @dragover.capture.prevent.stop
          @drop.capture.prevent.stop="onDropFile"
        ></textarea>
      </label>
      <div class="actions">
        <button class="primary" @click="encode">Encode →</button>
        <button class="primary" @click="decode">Decode →</button>
      </div>
      <div class="output-header">
        <span>Output</span>
        <div class="inline-actions">
          <button class="ghost small" :disabled="!output" @click="useOutputAsInput">
            Use as Input
          </button>
          <button class="ghost small" :disabled="!output" @click="copyOutput">Copy</button>
        </div>
      </div>
      <textarea v-model="output" readonly spellcheck="false"></textarea>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button class="ghost" :disabled="!output && !input" @click="addToSnippets">
          Add to Snippets
        </button>
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
  width: 520px;
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
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: -4px;
}
.inline-actions {
  display: flex;
  gap: 6px;
}
.small {
  padding: 3px 9px;
  font-size: 11.5px;
}
textarea {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 8px;
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 12.5px;
  resize: vertical;
  height: 90px;
}
textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.error {
  margin: 0;
  font-size: 12px;
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
