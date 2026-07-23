<script setup>
import { ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { base64Decode, base64Encode } from '../utils/base64'
import { useFileTextDrop } from '../composables/useFileDrop'
import BaseDialog from './BaseDialog.vue'

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
  await window.api.copyText(output.value)
  store.showNotice('Copied to clipboard.')
}

function close() {
  store.showBase64Dialog = false
}
</script>

<template>
  <BaseDialog width="520px" title="Base64 Encode / Decode" @close="close">
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
    <div class="dialog-actions">
      <button class="btn btn-primary" @click="encode">Encode →</button>
      <button class="btn btn-primary" @click="decode">Decode →</button>
    </div>
    <div class="output-header">
      <span>Output</span>
      <div class="inline-actions">
        <button class="btn btn-sm btn-ghost" :disabled="!output" @click="useOutputAsInput">
          Use as Input
        </button>
        <button class="btn btn-sm btn-ghost" :disabled="!output" @click="copyOutput">Copy</button>
      </div>
    </div>
    <textarea v-model="output" readonly spellcheck="false"></textarea>
    <p v-if="error" class="error">{{ error }}</p>
    <template #actions>
      <button class="btn btn-ghost" :disabled="!output && !input" @click="addToSnippets">
        Add to Snippets
      </button>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/Base64Dialog.css"></style>
