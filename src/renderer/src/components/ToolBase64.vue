<script setup>
import { computed, ref } from 'vue'
import { base64Decode, base64Encode, byteLength } from '../utils/base64'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'

defineProps({ compact: { type: Boolean, default: false } })

const MODES = [
  { value: 'encode', label: 'Encode' },
  { value: 'decode', label: 'Decode' }
]
const input = ref('')
const mode = ref('encode')
const urlSafe = ref(false)
const wrap = ref(false)

const result = computed(() => {
  const t = input.value
  if (!t) return { output: '' }
  try {
    if (mode.value === 'encode')
      return { output: base64Encode(t, { urlSafe: urlSafe.value, wrap: wrap.value }) }
    return { output: base64Decode(t) }
  } catch {
    return { error: 'Not valid Base64 (or not valid UTF-8 once decoded).' }
  }
})
const summary = computed(() => {
  const t = input.value
  const out = result.value.output || ''
  return mode.value === 'encode'
    ? `${byteLength(t)} B → ${out.length} chars`
    : `${t.length} chars → ${byteLength(out)} B`
})

const copied = ref(false)
async function copy() {
  if (!result.value.output) return
  const res = await window.api.copyText(result.value.output)
  if (!res?.ok) return
  copied.value = true
  setTimeout(() => (copied.value = false), 900)
}
</script>

<template>
  <div class="tb" :class="{ compact }">
    <SegmentedControl v-model:value="mode" :options="MODES" />
    <textarea
      v-model="input"
      class="tb-in"
      :placeholder="mode === 'encode' ? 'Text to encode…' : 'Base64 to decode…'"
      spellcheck="false"
      aria-label="Base64 input"
    ></textarea>

    <div v-if="mode === 'encode'" class="tb-opts">
      <label class="tb-chk"><input v-model="urlSafe" type="checkbox" /> URL-safe</label>
      <label class="tb-chk"><input v-model="wrap" type="checkbox" /> Wrap 76 cols</label>
    </div>

    <p v-if="result.error" class="tb-err">{{ result.error }}</p>
    <div v-else class="tb-block">
      <div class="tb-bh">
        <span
          >Result <span v-if="input" class="tb-count">· {{ summary }}</span></span
        >
        <button class="tb-copy" aria-label="Copy" data-tip="Copy" @click="copy">
          <AppIcon :name="copied ? 'check' : 'copy'" />
        </button>
      </div>
      <pre class="tb-text">{{ result.output }}</pre>
    </div>
  </div>
</template>

<style scoped src="./styles/ToolBase64.css"></style>
