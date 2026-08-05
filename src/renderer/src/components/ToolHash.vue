<script setup>
// Checksums. Every algorithm at once rather than a picker, because the question
// a checksum tool answers is "which of these matches what they published" —
// and the compare field answers it outright. Digests come from main
// (src/main/hashing.js); a file is streamed there, never read here.
import { computed, ref, watch } from 'vue'
import { HASH_LABELS, fileSize, matchingAlgorithm } from '../utils/hash'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'
import { useCopyFeedback } from '../composables/useCopyFeedback'

defineProps({ compact: { type: Boolean, default: false } })

const SOURCES = [
  { value: 'text', label: 'Text' },
  { value: 'file', label: 'File' }
]

const source = ref('text')
const input = ref('')
const digests = ref({})
const file = ref(null)
const busy = ref(false)
const expected = ref('')
const upper = ref(false)

watch([input, source], async () => {
  if (source.value !== 'text') return
  file.value = null
  digests.value = input.value ? await window.api.hashText(input.value) : {}
})

async function pickFile() {
  busy.value = true
  const res = await window.api.hashFile()
  busy.value = false
  if (!res || res.canceled) return
  if (res.error) {
    file.value = { name: res.error, size: null, failed: true }
    digests.value = {}
    return
  }
  file.value = { name: res.name, size: res.size }
  digests.value = res.digests
}

const rows = computed(() =>
  Object.entries(digests.value).map(([algo, digest]) => ({
    algo,
    label: HASH_LABELS[algo] ?? algo,
    digest: upper.value ? digest.toUpperCase() : digest
  }))
)
const check = computed(() => matchingAlgorithm(expected.value, digests.value))

const { copied: copiedAlgo, flash } = useCopyFeedback()
async function copy(row) {
  const res = await window.api.copyText(row.digest)
  if (!res?.ok) return
  flash(row.algo)
}
</script>

<template>
  <div class="th" :class="{ compact }">
    <div class="th-top">
      <SegmentedControl v-model:value="source" :label="$t('toolHash.of')" :options="SOURCES" />
      <label class="th-chk"
        ><input v-model="upper" type="checkbox" /> {{ $t('toolHash.uPPER') }}</label
      >
    </div>

    <textarea
      v-if="source === 'text'"
      v-model="input"
      class="th-in"
      :placeholder="$t('toolHash.pasteText')"
      spellcheck="false"
      :aria-label="$t('toolHash.textToHash')"
    ></textarea>

    <div v-else class="th-file">
      <button class="btn btn-sm" :disabled="busy" @click="pickFile">
        <AppIcon name="file" /> {{ busy ? $t('toolHash.reading') : $t('toolHash.chooseAFile') }}
      </button>
      <span v-if="file" class="th-fname" :class="{ bad: file.failed }">
        {{ file.name }}<span v-if="file.size !== null"> · {{ fileSize(file.size) }}</span>
      </span>
    </div>

    <div class="th-compare">
      <input
        v-model="expected"
        class="th-field"
        spellcheck="false"
        :placeholder="$t('toolHash.pasteTheDigestYouWere')"
        :aria-label="$t('toolHash.expectedDigest')"
      />
      <span v-if="check.checked" class="th-verdict" :class="{ ok: check.algorithm }">
        <AppIcon :name="check.algorithm ? 'check' : 'x'" />
        {{ check.algorithm ? `matches ${HASH_LABELS[check.algorithm]}` : 'no match' }}
      </span>
    </div>

    <div v-if="rows.length" class="th-rows">
      <div
        v-for="row in rows"
        :key="row.algo"
        class="th-row"
        :class="{ hit: check.algorithm === row.algo }"
      >
        <span class="th-algo">{{ row.label }}</span>
        <span class="th-digest">{{ row.digest }}</span>
        <button
          class="th-copy"
          :aria-label="`Copy ${row.label}`"
          :data-tip="$t('common.copy')"
          @click="copy(row)"
        >
          <AppIcon :name="copiedAlgo === row.algo ? 'check' : 'copy'" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles/ToolHash.css"></style>
