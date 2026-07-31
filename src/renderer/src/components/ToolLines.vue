<script setup>
import { computed, ref } from 'vue'
import { processLines } from '../utils/lines'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'

defineProps({ compact: { type: Boolean, default: false } })

const MODES = [
  { value: 'text', label: 'Text' },
  { value: 'word', label: 'Word' },
  { value: 'regex', label: 'Regex' }
]
const SORT_OPTS = [
  { value: 'none', label: 'Original' },
  { value: 'asc', label: 'A→Z' },
  { value: 'desc', label: 'Z→A' },
  { value: 'natural', label: 'Natural' }
]

const input = ref('')
const splitBy = ref('')
const trim = ref(false)
const dropBlank = ref(false)
const dedupe = ref(false)
const sort = ref('none')
const find = ref('')
const replace = ref('')
const mode = ref('text')
const caseInsensitive = ref(false)
const prefix = ref('')
const suffix = ref('')
const sepRaw = ref('')
const perLine = ref(true)

const separator = computed(() => sepRaw.value + (perLine.value ? '\n' : ''))
const result = computed(() =>
  processLines(input.value, {
    splitBy: splitBy.value,
    trim: trim.value,
    dropBlank: dropBlank.value,
    dedupe: dedupe.value,
    sort: sort.value,
    find: find.value,
    replace: replace.value,
    mode: mode.value,
    caseInsensitive: caseInsensitive.value,
    prefix: prefix.value,
    suffix: suffix.value,
    separator: separator.value
  })
)
const summary = computed(() => {
  const c = result.value.count
  if (!c) return ''
  const dup = c.dupes ? ` · ${c.dupes} dup${c.dupes === 1 ? '' : 's'}` : ''
  const rep = c.replaced ? ` · ${c.replaced} replaced` : ''
  return `${c.in} → ${c.out} line${c.out === 1 ? '' : 's'}${dup}${rep}`
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
  <div class="tln" :class="{ compact }">
    <textarea
      v-model="input"
      class="tln-in"
      placeholder="Paste lines…"
      spellcheck="false"
      aria-label="Lines"
    ></textarea>

    <div class="tln-row tln-checks">
      <label class="tln-chk"><input v-model="trim" type="checkbox" /> Trim</label>
      <label class="tln-chk"><input v-model="dropBlank" type="checkbox" /> Drop blanks</label>
      <label class="tln-chk"><input v-model="dedupe" type="checkbox" /> Dedupe</label>
    </div>

    <SegmentedControl v-model:value="sort" label="Sort" :options="SORT_OPTS" />

    <div class="tln-build">
      <div class="tln-row">
        <input
          v-model="splitBy"
          class="tln-field"
          placeholder='Split input by, e.g. ", " (blank = lines)'
          aria-label="Split by"
        />
      </div>
      <div class="tln-row">
        <input v-model="find" class="tln-field" placeholder="Find…" aria-label="Find" />
        <input v-model="replace" class="tln-field" placeholder="Replace…" aria-label="Replace" />
      </div>
      <div class="tln-row">
        <SegmentedControl v-model:value="mode" :options="MODES" />
        <label class="tln-chk">
          <input v-model="caseInsensitive" type="checkbox" /> Ignore case
        </label>
      </div>
      <div class="tln-row">
        <input
          v-model="prefix"
          class="tln-field"
          placeholder="Prefix each line…"
          aria-label="Prefix"
        />
        <input v-model="suffix" class="tln-field" placeholder="…suffix" aria-label="Suffix" />
      </div>
      <div class="tln-row">
        <input
          v-model="sepRaw"
          class="tln-field"
          placeholder="Join with, e.g. ,"
          aria-label="Separator"
        />
        <label class="tln-chk"><input v-model="perLine" type="checkbox" /> One per line</label>
      </div>
    </div>

    <p v-if="result.error" class="tln-err">{{ result.error }}</p>
    <div v-else class="tln-block">
      <div class="tln-bh">
        <span
          >Result <span class="tln-count">· {{ summary }}</span></span
        >
        <button class="tln-copy" aria-label="Copy" data-tip="Copy" @click="copy">
          <AppIcon :name="copied ? 'check' : 'copy'" />
        </button>
      </div>
      <pre class="tln-text">{{ result.output }}</pre>
    </div>
  </div>
</template>

<style scoped src="./styles/ToolLines.css"></style>
