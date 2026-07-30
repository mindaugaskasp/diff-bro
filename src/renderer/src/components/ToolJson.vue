<script setup>
import { computed, ref } from 'vue'
import { stringifyJson, jsonPath, sortDeep } from '../utils/json'
import SegmentedControl from './SegmentedControl.vue'
import JsonTree from './JsonTree.vue'
import AppIcon from './AppIcon.vue'

defineProps({ compact: { type: Boolean, default: false } })

const MODES = [
  { value: 'pretty', label: 'Pretty' },
  { value: 'minify', label: 'Minify' },
  { value: 'sort', label: 'Sort keys' }
]
const input = ref('')
const mode = ref('pretty')
const filter = ref('')

const parsed = computed(() => {
  const t = input.value.trim()
  if (!t) return {}
  try {
    return { value: JSON.parse(t) }
  } catch (e) {
    return { error: e.message }
  }
})
const hasValue = computed(() => 'value' in parsed.value)
const filtered = computed(() => {
  if (!hasValue.value) return {}
  const f = filter.value.trim()
  if (!f) return { value: parsed.value.value }
  const r = jsonPath(parsed.value.value, f)
  if (r.error) return { filterError: r.error }
  return { value: r.matches.length === 1 ? r.matches[0] : r.matches, count: r.matches.length }
})
const shaped = computed(() =>
  'value' in filtered.value ? stringifyJson(filtered.value.value, mode.value) : ''
)
const treeValue = computed(() =>
  mode.value === 'sort' && 'value' in filtered.value
    ? sortDeep(filtered.value.value)
    : filtered.value.value
)

const copied = ref(false)
async function copy(text) {
  if (!text) return
  const res = await window.api.copyText(text)
  if (!res?.ok) return
  copied.value = true
  setTimeout(() => (copied.value = false), 900)
}
</script>

<template>
  <div class="tjs" :class="{ compact }">
    <textarea
      v-model="input"
      class="tjs-in"
      placeholder="Paste JSON…"
      spellcheck="false"
      aria-label="JSON"
    ></textarea>

    <p v-if="parsed.error" class="tjs-err">{{ parsed.error }}</p>

    <template v-else-if="hasValue">
      <div class="tjs-ctrls">
        <SegmentedControl v-model:value="mode" :options="MODES" />
        <input
          v-model="filter"
          class="tjs-filter"
          placeholder="$.path[*] — JSONPath"
          spellcheck="false"
          aria-label="JSONPath filter"
        />
      </div>

      <p v-if="filtered.filterError" class="tjs-err">{{ filtered.filterError }}</p>
      <template v-else>
        <div class="tjs-block">
          <div class="tjs-bh">
            <span>
              Result
              <span v-if="filtered.count != null" class="tjs-count">
                · {{ filtered.count }} match{{ filtered.count === 1 ? '' : 'es' }}
              </span>
            </span>
            <button class="tjs-copy" aria-label="Copy" title="Copy" @click="copy(shaped)">
              <AppIcon :name="copied ? 'check' : 'copy'" />
            </button>
          </div>
          <pre class="tjs-text">{{ shaped }}</pre>
        </div>
        <div class="tjs-tree"><JsonTree :value="treeValue" /></div>
      </template>
    </template>
  </div>
</template>

<style scoped src="./styles/ToolJson.css"></style>
