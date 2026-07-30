<script setup>
// Inline convert panel for the Quick Look launcher: paste a string, see the
// converted result, copy it — all without raising the app. A `panel` tool
// (e.g. Epoch) renders its own rich body instead of the input/output textareas.
// Tab moves between the input and the (read-only) output; ← at the start of the
// input backs out to the list, mirroring ← out of a snippet preview.
import { computed, nextTick, onMounted, ref } from 'vue'
import { isMac } from '../keys'
import AppIcon from './AppIcon.vue'
import ToolEpoch from './ToolEpoch.vue'
import ToolUuid from './ToolUuid.vue'
import ToolUrl from './ToolUrl.vue'
import ToolJwt from './ToolJwt.vue'
import ToolJson from './ToolJson.vue'

const props = defineProps({
  tool: { type: Object, required: true }, // { id, name, panel? }
  result: { type: Object, required: true } // { output } | { error }
})
const input = defineModel('input', { type: String, default: '' })
const emit = defineEmits(['copy', 'back'])
const inputEl = ref(null)
const copyKey = isMac ? '⌘C' : 'Ctrl+C'
const PANEL_ICONS = {
  epoch: 'clock',
  uuid: 'hash',
  url: 'link',
  jwt: 'shield-check',
  json: 'braces'
}
const headIcon = computed(() => PANEL_ICONS[props.tool.panel] || 'wrench')
onMounted(() => {
  if (!props.tool.panel) nextTick(() => inputEl.value?.focus())
})

const atStart = (t) => t && t.selectionStart === 0 && t.selectionStart === t.selectionEnd
const hasSelection = (t) => t && t.selectionStart != null && t.selectionStart !== t.selectionEnd

// Escape is handled once at the container (below); here: ← at caret start backs
// out, and Cmd/Ctrl+C (or Enter) copies unless a real text selection should copy.
function onKeydown(e) {
  if (e.key === 'ArrowLeft') return void (atStart(e.target) && emit('back'))
  const combo = (e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C' || e.key === 'Enter')
  if (!combo || hasSelection(e.target)) return
  e.preventDefault()
  emit('copy')
}
</script>

<template>
  <div class="qc" @keydown.escape="$emit('back')">
    <div class="qc-head band">
      <button class="qc-back" title="Back (Esc / ←)" @click="$emit('back')">
        <AppIcon name="chevron-left" />
      </button>
      <AppIcon :name="headIcon" class="qc-ico" />
      <span class="qc-name">{{ tool.name }}</span>
      <span class="qc-kbd">Esc</span>
    </div>

    <div v-if="tool.panel" class="qc-panel">
      <ToolEpoch v-if="tool.panel === 'epoch'" compact />
      <ToolUuid v-else-if="tool.panel === 'uuid'" compact />
      <ToolUrl v-else-if="tool.panel === 'url'" compact />
      <ToolJwt v-else-if="tool.panel === 'jwt'" compact />
      <ToolJson v-else-if="tool.panel === 'json'" compact />
    </div>
    <template v-else>
      <textarea
        ref="inputEl"
        v-model="input"
        class="qc-field qc-in"
        placeholder="Paste text to convert…"
        autocomplete="off"
        spellcheck="false"
        @keydown="onKeydown"
      ></textarea>
      <textarea
        class="qc-field qc-out"
        :class="{ err: !!result.error }"
        :value="result.error ? '' : result.output"
        readonly
        placeholder="The result appears here."
        aria-live="polite"
        @keydown="onKeydown"
      ></textarea>
    </template>

    <div class="qc-foot band">
      <span v-if="result.error" class="qc-err">Couldn't convert that input.</span>
      <span v-else class="qc-lock"><AppIcon name="lock" /> stays on this machine</span>
      <button
        v-if="!tool.panel"
        class="btn btn-primary btn-sm"
        :disabled="!result.output"
        @click="$emit('copy')"
      >
        <AppIcon name="copy" /> Copy ({{ copyKey }})
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/QuickLookConvert.css"></style>
