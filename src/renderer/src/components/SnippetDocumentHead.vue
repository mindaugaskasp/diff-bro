<script setup>
import { ref } from 'vue'
import SnippetNameField from './SnippetNameField.vue'
import SnippetNameHint from './SnippetNameHint.vue'
import TagChipRow from './TagChipRow.vue'
import SnippetSecretToggle from './SnippetSecretToggle.vue'

defineProps({
  initialTags: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: true }
})
const name = defineModel('name', { type: String, default: '' })
const secret = defineModel('secret', { type: Boolean, default: false })
const emit = defineEmits(['editTags', 'editName'])
const nameLabel = ref(null)

const tagField = ref(null)
defineExpose({
  tagValues: () => ({ tags: tagField.value.tags, tagColors: tagField.value.newColors() }),
  focusTags: () => tagField.value?.focus(),
  focusName: () => nameLabel.value?.querySelector('input')?.focus()
})
</script>

<template>
  <header class="doc-head">
    <div class="doc-ident">
      <label ref="nameLabel" class="doc-name" @mousedown="readOnly && emit('editName')">
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
        <TagChipRow
          ref="tagField"
          :initial="initialTags"
          :readonly="readOnly"
          @request-edit="emit('editTags')"
        />
        <SnippetSecretToggle v-model="secret" :readonly="readOnly" />
      </div>
    </div>
  </header>
</template>

<style scoped src="./styles/SnippetEditor.css"></style>
<style scoped src="./styles/SnippetDocument.css"></style>
