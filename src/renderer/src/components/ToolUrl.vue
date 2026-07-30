<script setup>
// The URL tool panel — hosted in the Tools dialog and the Quick Look launcher.
// Encode/decode (component or full-URI), plus an editable query-param table that
// rebuilds the URL as you edit. Pure logic in utils/url.
import { computed, ref, watch } from 'vue'
import { encodeUrl, decodeUrl, parseQuery, buildQuery } from '../utils/url'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'

defineProps({ compact: { type: Boolean, default: false } })

const MODES = [
  { value: 'encode', label: 'Encode' },
  { value: 'decode', label: 'Decode' }
]
const SCOPES = [
  { value: 'component', label: 'Component' },
  { value: 'full', label: 'Full URI' }
]

const mode = ref('encode')
const scope = ref('component')
const input = ref('')
const component = computed(() => scope.value === 'component')
const output = computed(() =>
  mode.value === 'encode'
    ? encodeUrl(input.value, { component: component.value })
    : decodeUrl(input.value, { component: component.value })
)

// The query-param table is parsed from the input; editing a row rebuilds the URL
// (a fresh input re-parses, replacing any row edits).
const base = ref('')
const params = ref([])
watch(input, (v) => {
  const parsed = parseQuery(v)
  base.value = parsed.base
  params.value = parsed.params
})
const hasQuery = computed(() => input.value.includes('?'))
const rebuilt = computed(() => buildQuery(base.value, params.value))

const copied = ref('')
async function copy(text) {
  if (!text) return
  const res = await window.api.copyText(text)
  if (!res?.ok) return
  copied.value = text
  setTimeout(() => (copied.value = ''), 900)
}
</script>

<template>
  <div class="tur" :class="{ compact }">
    <div class="tur-ctrls">
      <SegmentedControl v-model:value="mode" :options="MODES" />
      <SegmentedControl v-model:value="scope" :options="SCOPES" />
    </div>

    <textarea
      v-model="input"
      class="tur-in"
      placeholder="URL or text to encode / decode…"
      spellcheck="false"
      aria-label="URL or text"
    ></textarea>
    <div class="tur-out">
      <span class="tur-out-v">{{ output || '—' }}</span>
      <button
        v-if="output"
        class="tur-copy"
        aria-label="Copy result"
        title="Copy"
        @click="copy(output)"
      >
        <AppIcon :name="copied === output ? 'check' : 'copy'" />
      </button>
    </div>

    <div v-if="hasQuery" class="tur-params">
      <span class="tur-k">Query parameters</span>
      <div v-for="(p, i) in params" :key="i" class="tur-row">
        <input v-model="p.key" class="tur-cell" spellcheck="false" aria-label="Parameter key" />
        <input v-model="p.value" class="tur-cell" spellcheck="false" aria-label="Parameter value" />
        <button
          class="tur-x"
          aria-label="Remove parameter"
          title="Remove"
          @click="params.splice(i, 1)"
        >
          <AppIcon name="x" />
        </button>
      </div>
      <button class="btn btn-sm tur-add" @click="params.push({ key: '', value: '' })">
        <AppIcon name="plus" /> Parameter
      </button>
      <div class="tur-out">
        <span class="tur-out-v">{{ rebuilt }}</span>
        <button class="tur-copy" aria-label="Copy URL" title="Copy" @click="copy(rebuilt)">
          <AppIcon :name="copied === rebuilt ? 'check' : 'copy'" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles/ToolUrl.css"></style>
