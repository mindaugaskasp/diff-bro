<script setup>
// Shared shell for a TEXT_TOOLS entry. Format/validate tools edit a Monaco
// buffer; a `panel` tool (e.g. Epoch) renders its own controls-based body.
import { computed, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useSettingsStore } from '../stores/settingsStore'
import { TEXT_TOOLS, toolStatusText } from '../utils/textTools'
import { useMonacoInput } from '../composables/useMonacoInput'
import { useFileTextDrop } from '../composables/useFileDrop'
import BaseDialog from './BaseDialog.vue'
import ToolEpoch from './ToolEpoch.vue'

const props = defineProps({
  // Key into TEXT_TOOLS — which tool this dialog is showing.
  tool: { type: String, required: true }
})

const store = useDiffStore()
const snippets = useSnippetStore()
const settings = useSettingsStore()
const tool = computed(() => TEXT_TOOLS[props.tool])
const isPanel = computed(() => !!tool.value.panel)

const container = ref(null)
const input = ref('')
const language = computed(() => tool.value.language)
let onDropFile = () => {}

// A panel tool has no text buffer, so Monaco (and file-drop) wire up only for the
// format/validate tools. The dialog remounts per tool (:key), so this one-time
// branch is stable.
if (!tool.value.panel) {
  useMonacoInput({ container, content: input, language })
  ;({ onDropFile } = useFileTextDrop((text) => (input.value = text)))
}

// Drives the status line and Monaco's inline squiggle.
const status = computed(() => (input.value.trim() ? tool.value.validate(input.value) : null))
const statusText = computed(() => toolStatusText(tool.value, status.value))
const canFormat = computed(() => (tool.value.requiresValid ? !!status.value?.valid : !!input.value))

function format() {
  if (canFormat.value) input.value = tool.value.format(input.value)
}
async function copy() {
  await window.api.copyText(input.value)
  store.showNotice('Copied to clipboard.')
}
function addToSnippets() {
  snippets.startNewSnippetFrom(input.value, tool.value.language)
  close()
}
function close() {
  store.textTool = null
}
</script>

<template>
  <BaseDialog
    :width="isPanel ? '460px' : '560px'"
    :resizable="!isPanel"
    close-on-backdrop
    :min-size="{ width: 420, height: 360 }"
    :initial-size="settings.dialogSize('texttool')"
    :title="tool.title"
    @close="close"
    @resize="(s) => settings.setDialogSize('texttool', s)"
  >
    <ToolEpoch v-if="tool.panel === 'epoch'" />
    <template v-else>
      <div
        ref="container"
        class="editor"
        title="Drop a file here to load it"
        @dragover.capture.prevent.stop
        @drop.capture.prevent.stop="onDropFile"
      ></div>
      <p v-if="status" class="status" :class="{ valid: status.valid, invalid: !status.valid }">
        {{ statusText }}
      </p>
      <p v-if="tool.note" class="dialog-note">{{ tool.note }}</p>
    </template>
    <template #actions>
      <template v-if="!isPanel">
        <button class="btn btn-primary" :disabled="!canFormat" @click="format">
          {{ tool.actionLabel ?? 'Format' }}
        </button>
        <button class="btn btn-ghost" :disabled="!input" @click="copy">Copy</button>
        <button class="btn btn-ghost" :disabled="!input" @click="addToSnippets">
          Add to Snippets
        </button>
      </template>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TextToolDialog.css"></style>
