<script setup>
import { computed, ref } from 'vue'
import { processLines } from '../utils/lines'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'
import { offerToolOutput } from '../composables/useToolOutput'
import { useCopyFeedback } from '../composables/useCopyFeedback'

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

const { copied, flash } = useCopyFeedback()
async function copy() {
  if (!result.value.output) return
  const res = await window.api.copyText(result.value.output)
  if (!res?.ok) return
  flash()
}

// Offer this panel's result to the dialog's Save-as-snippet action.
offerToolOutput(
  () => result.value.output ?? '',
  () => 'plaintext'
)
</script>

<template>
  <div class="tln" :class="{ compact }">
    <textarea
      v-model="input"
      class="tln-in"
      :placeholder="$t('toolLines.pasteLines')"
      spellcheck="false"
      :aria-label="$t('toolLines.lines')"
    ></textarea>

    <div class="tln-row tln-checks">
      <label class="tln-chk"
        ><input v-model="trim" type="checkbox" /> {{ $t('toolLines.trim') }}</label
      >
      <label class="tln-chk"
        ><input v-model="dropBlank" type="checkbox" /> {{ $t('toolLines.dropBlanks') }}</label
      >
      <label class="tln-chk"
        ><input v-model="dedupe" type="checkbox" /> {{ $t('toolLines.dedupe') }}</label
      >
    </div>

    <SegmentedControl v-model:value="sort" :label="$t('toolLines.sort')" :options="SORT_OPTS" />

    <div class="tln-build">
      <div class="tln-row">
        <input
          v-model="splitBy"
          class="tln-field"
          placeholder='Split input by, e.g. ", " (blank = lines)'
          :aria-label="$t('toolLines.splitBy')"
        />
      </div>
      <div class="tln-row">
        <input
          v-model="find"
          class="tln-field"
          :placeholder="$t('toolLines.find')"
          :aria-label="$t('toolLines.find2')"
        />
        <input
          v-model="replace"
          class="tln-field"
          :placeholder="$t('toolLines.replace')"
          :aria-label="$t('toolLines.replace2')"
        />
      </div>
      <div class="tln-row">
        <SegmentedControl v-model:value="mode" :options="MODES" />
        <label class="tln-chk">
          <input v-model="caseInsensitive" type="checkbox" /> {{ $t('toolLines.ignoreCase') }}
        </label>
      </div>
      <div class="tln-row">
        <input
          v-model="prefix"
          class="tln-field"
          :placeholder="$t('toolLines.prefixEachLine')"
          :aria-label="$t('toolLines.prefix')"
        />
        <input
          v-model="suffix"
          class="tln-field"
          :placeholder="$t('toolLines.suffix')"
          :aria-label="$t('toolLines.suffix2')"
        />
      </div>
      <div class="tln-row">
        <input
          v-model="sepRaw"
          class="tln-field"
          :placeholder="$t('toolLines.joinWithEG')"
          :aria-label="$t('toolLines.separator')"
        />
        <label class="tln-chk"
          ><input v-model="perLine" type="checkbox" /> {{ $t('toolLines.onePerLine') }}</label
        >
      </div>
    </div>

    <p v-if="result.error" class="tln-err">{{ result.error }}</p>
    <div v-else class="tln-block">
      <div class="tln-bh">
        <span
          >{{ $t('toolLines.result') }} <span class="tln-count">· {{ summary }}</span></span
        >
        <button
          class="tln-copy"
          :aria-label="$t('common.copy')"
          :data-tip="$t('common.copy')"
          @click="copy"
        >
          <AppIcon :name="copied ? 'check' : 'copy'" />
        </button>
      </div>
      <pre class="tln-text">{{ result.output }}</pre>
    </div>
  </div>
</template>

<style scoped src="./styles/ToolLines.css"></style>
