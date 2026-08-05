<script setup>
// The editor's header strip: the "Content" label, the rendered/plain toggle and
// the syntax picker. Its own component so SnippetEditorDialog's template stays
// inside its cap.
import { SNIPPET_LANGUAGES } from '../utils/detectLanguage'

defineProps({
  editMode: { type: Boolean, default: false },
  hasPreview: { type: Boolean, default: false },
  plain: { type: Boolean, default: false },
  language: { type: String, default: '' },
  chosenLanguage: { type: String, default: 'auto' },
  readOnly: { type: Boolean, default: false }
})
defineEmits(['update:plain', 'update:chosenLanguage'])
</script>

<template>
  <div class="editor-header">
    <span
      >{{ $t('snippetEditorDialog.content') }}
      <span v-if="editMode" class="drop-hint">{{
        $t('snippetEditorDialog.orDropAFile')
      }}</span></span
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
      <label class="lang-picker">
        {{ $t('snippetEditorDialog.syntax') }}
        <select
          :value="chosenLanguage"
          :disabled="readOnly"
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

<style scoped src="./styles/SnippetEditorDialog.css"></style>
