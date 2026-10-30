<script setup>
import { computed } from 'vue'
import { SNIPPET_LANGUAGES } from '../utils/detectLanguage'
import { t } from '../i18n'

const props = defineProps({
  resolved: { type: String, default: 'plaintext' },
  label: { type: String, required: true }
})
const chosen = defineModel({ type: String, required: true })

// Auto carries what it resolved to, so the picker doubles as the readout.
const labelOf = (id) =>
  t(SNIPPET_LANGUAGES.find((l) => l.id === id)?.labelKey ?? 'language.plaintext')
const options = computed(() =>
  SNIPPET_LANGUAGES.map(({ id, labelKey }) => ({
    id,
    label: id === 'auto' ? `${t(labelKey)} · ${labelOf(props.resolved)}` : t(labelKey)
  }))
)
</script>

<template>
  <select v-model="chosen" class="lang-select focus-ring" :aria-label="label">
    <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
  </select>
</template>

<style scoped src="./styles/LanguageSelect.css"></style>
