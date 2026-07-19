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

<style scoped>
.hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 14px;
  font-size: 12.5px;
  background: var(--warning-bg);
  border-bottom: 1px solid var(--warning-border);
  color: var(--warning-text);
}
.hint.invalid {
  background: var(--danger-bg);
  border-bottom-color: var(--danger-border);
  color: var(--danger-text);
}
.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.format,
.dismiss {
  border-radius: 5px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.format {
  background: var(--warning-text);
  border: none;
  color: var(--warning-bg);
}
.hint.invalid .format {
  background: var(--danger-text);
  color: var(--danger-bg);
}
.dismiss {
  background: none;
  border: 1px solid currentColor;
  color: inherit;
  opacity: 0.85;
}
</style>
