<script setup>
import { ref } from 'vue'
import SnippetNameField from './SnippetNameField.vue'
import SnippetNameHint from './SnippetNameHint.vue'
import TagChipsField from './TagChipsField.vue'
import SnippetSecretToggle from './SnippetSecretToggle.vue'

defineProps({
  initialTags: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: true }
})
const name = defineModel('name', { type: String, default: '' })
const secret = defineModel('secret', { type: Boolean, default: false })

const tagField = ref(null)
defineExpose({
  tagValues: () => ({ tags: tagField.value.tags, tagColors: tagField.value.newColors() })
})
</script>

<template>
  <header class="doc-head">
    <div class="doc-ident">
      <label class="doc-name">
        <span class="visually-hidden">{{ $t('snippetEditorDialog.name') }}</span>
        <SnippetNameField
          v-model="name"
          :placeholder="$t('snippetEditorDialog.snippetName')"
          :readonly="readOnly"
        />
      </label>
      <span v-if="editMode && !name.trim()" class="required-hint">
        {{ $t('snippetEditorDialog.aSnippetNeedsAName') }}
      </span>
      <SnippetNameHint v-if="editMode" :name="name" />
      <div class="doc-meta">
        <TagChipsField ref="tagField" :initial="initialTags" :readonly="readOnly" />
        <SnippetSecretToggle v-model="secret" :readonly="readOnly" />
      </div>
    </div>
    <div class="doc-actions"><slot /></div>
  </header>
</template>

<style scoped src="./styles/SnippetEditor.css"></style>
<style scoped src="./styles/SnippetDocument.css"></style>
