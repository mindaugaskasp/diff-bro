<script setup>
// Inline convert panel for the Quick Look launcher: paste a string, see the
// converted result, copy it — all without raising the app. The transform runs
// in useQuickLook (pure utils/quickLookCommands); this is just the surface.
// Tab moves between the input and the (read-only) output; ← at the start of the
// input backs out to the list, mirroring ← out of a snippet preview.
import { nextTick, onMounted, ref } from 'vue'
import { isMac } from '../keys'
import AppIcon from './AppIcon.vue'

defineProps({
  tool: { type: Object, required: true }, // { id, name }
  result: { type: Object, required: true } // { output } | { error }
})
const input = defineModel('input', { type: String, default: '' })
defineEmits(['copy', 'back'])
const inputEl = ref(null)
const copyKey = isMac ? '⌘C' : 'Ctrl+C'
onMounted(() => nextTick(() => inputEl.value?.focus()))

const atStart = (t) => t && t.selectionStart === 0 && t.selectionStart === t.selectionEnd
const hasSelection = (t) => t && t.selectionStart != null && t.selectionStart !== t.selectionEnd

function onKeydown(e, emit) {
  if (e.key === 'Escape') return emit('back')
  if (e.key === 'ArrowLeft') return void (atStart(e.target) && emit('back'))
  const combo = (e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C' || e.key === 'Enter')
  if (!combo || hasSelection(e.target)) return // let a real text selection copy natively
  e.preventDefault()
  emit('copy')
}
</script>

<template>
  <div class="qc">
    <div class="qc-head band">
      <button class="qc-back" title="Back (Esc / ←)" @click="$emit('back')">
        <AppIcon name="chevron-left" />
      </button>
      <AppIcon name="wrench" class="qc-ico" />
      <span class="qc-name">{{ tool.name }}</span>
      <span class="qc-kbd">Esc</span>
    </div>
    <textarea
      ref="inputEl"
      v-model="input"
      class="qc-field qc-in"
      placeholder="Paste text to convert…"
      autocomplete="off"
      spellcheck="false"
      @keydown="(e) => onKeydown(e, $emit)"
    ></textarea>
    <textarea
      class="qc-field qc-out"
      :class="{ err: !!result.error }"
      :value="result.error ? '' : result.output"
      readonly
      placeholder="The result appears here."
      aria-live="polite"
      @keydown="(e) => onKeydown(e, $emit)"
    ></textarea>
    <div class="qc-foot band">
      <span v-if="result.error" class="qc-err">Couldn't convert that input.</span>
      <span v-else class="qc-lock"><AppIcon name="lock" /> stays on this machine</span>
      <button class="btn btn-primary btn-sm" :disabled="!result.output" @click="$emit('copy')">
        <AppIcon name="copy" /> Copy ({{ copyKey }})
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/QuickLookConvert.css"></style>
