<script setup>
// Find & Replace tool: literal characters, whole words, or a regex, over the
// input text. The matching itself is the pure replaceText() in utils — this is
// the input/output shell around it, mirroring the Base64 dialog.
import { ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { replaceText } from '../utils/findReplace'
import { useFileTextDrop } from '../composables/useFileDrop'
import BaseDialog from './BaseDialog.vue'

const store = useDiffStore()
const snippets = useSnippetStore()
const input = ref('')
const { onDropFile } = useFileTextDrop((text) => (input.value = text))
const find = ref('')
const replace = ref('')
const mode = ref('text') // 'text' | 'word' | 'regex'
const caseInsensitive = ref(false)
const output = ref('')
const error = ref(null)
const count = ref(null)

function run() {
  const res = replaceText({
    text: input.value,
    find: find.value,
    replace: replace.value,
    mode: mode.value,
    caseInsensitive: caseInsensitive.value
  })
  error.value = res.error || null
  output.value = res.error ? '' : res.output
  count.value = res.error ? null : res.count
}

function useOutputAsInput() {
  input.value = output.value
  output.value = ''
  count.value = null
  error.value = null
}
async function copyOutput() {
  await window.api.copyText(output.value)
  store.showNotice('Copied to clipboard.')
}
function addToSnippets() {
  snippets.startNewSnippetFrom(output.value || input.value, 'auto')
  close()
}
function close() {
  store.showFindReplaceDialog = false
}
</script>

<template>
  <BaseDialog width="560px" title="Find & Replace" @close="close">
    <label>
      Input
      <textarea
        v-model="input"
        spellcheck="false"
        placeholder="Text… (or drop a file here)"
        @dragover.capture.prevent.stop
        @drop.capture.prevent.stop="onDropFile"
      ></textarea>
    </label>
    <div class="fr-grid">
      <label>
        Find
        <input v-model="find" spellcheck="false" :placeholder="mode === 'regex' ? 'pattern' : 'text to find'" />
      </label>
      <label>
        Replace with
        <input v-model="replace" spellcheck="false" placeholder="replacement" />
      </label>
    </div>
    <div class="fr-opts">
      <label class="fr-mode">
        Match
        <select v-model="mode">
          <option value="text">Characters</option>
          <option value="word">Whole words</option>
          <option value="regex">Regex</option>
        </select>
      </label>
      <label class="fr-check"><input v-model="caseInsensitive" type="checkbox" /> Case-insensitive</label>
      <button class="btn btn-primary" :disabled="!find" @click="run">Replace All</button>
    </div>
    <div class="output-header">
      <span>Output <span v-if="count !== null" class="fr-count">· {{ count }} replaced</span></span>
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

<style scoped src="./styles/FindReplaceDialog.css"></style>
