<script setup>
import { computed } from 'vue'
import { t } from '../i18n'
import { SNIPPET_LANGUAGES } from '../utils/detectLanguage'

const props = defineProps({
  hasPreview: { type: Boolean, default: false },
  plain: { type: Boolean, default: false },
  language: { type: String, default: '' },
  chosenLanguage: { type: String, default: 'auto' },
  canFormat: { type: Boolean, default: false }
})
defineEmits(['update:plain', 'update:chosenLanguage', 'format'])

// Mermaid's formatter repairs pasted damage; it does not pretty-print.
const isMermaid = computed(() => props.language === 'mermaid')
const formatLabel = computed(() => (isMermaid.value ? 'Repair' : 'Format'))
const formatTip = computed(() => {
  if (!props.canFormat) return t('snippetEditorActions.formatUnavailable')
  return isMermaid.value
    ? t('snippetEditorActions.unmangleTip')
    : t('snippetEditorActions.prettyPrintAs', { format: props.language.toUpperCase() })
})
</script>

<template>
  <div class="editor-header">
    <span
      >{{ $t('snippetEditorDialog.content') }}
      <span class="drop-hint">{{ $t('snippetEditorDialog.orDropAFile') }}</span></span
    >
    <div class="editor-controls">
      <div
        v-if="hasPreview"
        class="view-toggle"
        role="group"
        :aria-label="$t('snippetEditorDialog.viewMode')"
      >
        <button type="button" :class="{ active: !plain }" @click="$emit('update:plain', false)">
          {{ $t('snippetEditorDialog.rendered') }}
        </button>
        <button type="button" :class="{ active: plain }" @click="$emit('update:plain', true)">
          {{ $t('snippetEditorDialog.plain') }}
        </button>
      </div>
      <button
        type="button"
        class="btn btn-sm"
        :disabled="!canFormat"
        :data-tip="formatTip"
        @click="$emit('format')"
      >
        {{ formatLabel }}
      </button>
      <label class="lang-picker">
        {{ $t('snippetEditorDialog.syntax') }}
        <select
          :value="chosenLanguage"
          @change="$emit('update:chosenLanguage', $event.target.value)"
        >
          <option v-for="l in SNIPPET_LANGUAGES" :key="l.id" :value="l.id">
            {{ $t(l.labelKey) }}
          </option>
        </select>
        <span v-if="chosenLanguage === 'auto'" class="lang-detected">→ {{ language }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped src="./styles/SnippetEditor.css"></style>
