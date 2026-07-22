<script setup>
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const props = defineProps({ side: { type: String, required: true } })
const store = useDiffStore()

const hint = computed(() => (props.side === 'left' ? store.leftFormatHint : store.rightFormatHint))
const sideLabel = computed(() => (props.side === 'left' ? 'Left' : 'Right'))
const kindLabel = computed(() => (hint.value?.kind === 'json' ? 'JSON' : 'XML'))
const location = computed(() =>
  hint.value?.line ? ` at line ${hint.value.line}, column ${hint.value.column}` : ''
)
</script>

<template>
  <div v-if="hint" class="hint" :class="{ invalid: !hint.valid }">
    <span v-if="hint.valid">
      <strong>{{ sideLabel }}</strong> looks like {{ kindLabel }} — pretty-print it?
    </span>
    <span v-else>
      <strong>{{ sideLabel }}</strong> looks like {{ kindLabel }} but doesn't parse{{ location
      }}{{ hint.error ? `: ${hint.error}` : '' }}
    </span>
    <div class="actions">
      <button v-if="hint.valid" class="format" @click="store.formatSide(side)">Format</button>
      <button class="dismiss" @click="store.dismissFormatHint(side)">Dismiss</button>
    </div>
  </div>
</template>

<style scoped src="./styles/FormatHintBanner.css"></style>
