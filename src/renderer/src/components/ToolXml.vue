<script setup>
import { computed, ref } from 'vue'
import { parseXml, stringifyXml, xpath } from '../utils/xml'
import SegmentedControl from './SegmentedControl.vue'
import XmlTree from './XmlTree.vue'
import AppIcon from './AppIcon.vue'
import { offerToolOutput } from '../composables/useToolOutput'

defineProps({ compact: { type: Boolean, default: false } })

const MODES = [
  { value: 'pretty', label: 'Pretty' },
  { value: 'minify', label: 'Minify' }
]
const input = ref('')
const mode = ref('pretty')
const filter = ref('')

const parsed = computed(() => (input.value.trim() ? parseXml(input.value) : {}))
const errorText = computed(() => {
  const p = parsed.value
  if (!p.error) return ''
  const loc = p.line ? ` (line ${p.line}, column ${p.column})` : ''
  return `${p.error}${loc}`
})
const filtered = computed(() => {
  if (!parsed.value.root || !filter.value.trim()) return {}
  const r = xpath(parsed.value.root, filter.value)
  return r.error ? { filterError: r.error } : { matches: r.matches, count: r.matches.length }
})
const shaped = computed(() => (parsed.value.root ? stringifyXml(input.value, mode.value) : ''))
const treeNodes = computed(() => {
  if (filtered.value.matches) return filtered.value.matches.filter((m) => typeof m !== 'string')
  return parsed.value.root ? [parsed.value.root] : []
})
const matchValues = computed(() =>
  (filtered.value.matches ?? []).filter((m) => typeof m === 'string')
)

const copied = ref(false)
async function copy() {
  if (!shaped.value) return
  const res = await window.api.copyText(shaped.value)
  if (!res?.ok) return
  copied.value = true
  setTimeout(() => (copied.value = false), 900)
}

// Offer this panel's result to the dialog's Save-as-snippet action.
offerToolOutput(
  () => shaped.value ?? '',
  () => 'xml'
)
</script>

<template>
  <div class="txm" :class="{ compact }">
    <textarea
      v-model="input"
      class="txm-in"
      placeholder="Paste XML…"
      spellcheck="false"
      aria-label="XML"
    ></textarea>

    <p v-if="errorText" class="txm-err">{{ errorText }}</p>

    <template v-else-if="parsed.root">
      <div class="txm-ctrls">
        <SegmentedControl v-model:value="mode" :options="MODES" />
        <input
          v-model="filter"
          class="txm-filter"
          placeholder="//tag/@attr — XPath"
          spellcheck="false"
          aria-label="XPath filter"
        />
      </div>

      <p v-if="filtered.filterError" class="txm-err">{{ filtered.filterError }}</p>
      <template v-else>
        <div class="txm-block">
          <div class="txm-bh">
            <span>
              Result
              <span v-if="filtered.count != null" class="txm-count">
                · {{ filtered.count }} match{{ filtered.count === 1 ? '' : 'es' }}
              </span>
            </span>
            <button class="txm-copy" aria-label="Copy" data-tip="Copy" @click="copy">
              <AppIcon :name="copied ? 'check' : 'copy'" />
            </button>
          </div>
          <pre class="txm-text">{{ shaped }}</pre>
        </div>
        <ul v-if="matchValues.length" class="txm-values">
          <li v-for="(v, i) in matchValues" :key="i">{{ v }}</li>
        </ul>
        <div v-if="treeNodes.length" class="txm-tree">
          <XmlTree v-for="(n, i) in treeNodes" :key="i" :node="n" />
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped src="./styles/ToolXml.css"></style>
