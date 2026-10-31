<script setup>
import { ref } from 'vue'
import SnippetNameField from './SnippetNameField.vue'
import SnippetNameHint from './SnippetNameHint.vue'
import TagChipRow from './TagChipRow.vue'

defineProps({
  initialTags: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
  needsName: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: true }
})
const name = defineModel('name', { type: String, default: '' })
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
  <header class="doc-head band head-band">
    <label ref="nameLabel" class="doc-name" @mousedown="readOnly && emit('editName')">
      <span class="visually-hidden">{{ $t('snippetEditorDialog.name') }}</span>
      <SnippetNameField
        v-model="name"
        :placeholder="
          needsName
            ? $t('snippetEditorDialog.aSnippetNeedsAName')
            : $t('snippetEditorDialog.snippetName')
        "
        :readonly="readOnly"
        :invalid="needsName"
      >
        <SnippetNameHint v-if="editMode" :name="name" />
      </SnippetNameField>
    </label>
    <TagChipRow
      ref="tagField"
      class="doc-tags"
      :initial="initialTags"
      :readonly="readOnly"
      @request-edit="emit('editTags')"
    />
  </header>
</template>

<style scoped src="./styles/SnippetEditor.css"></style>
<style scoped src="./styles/SnippetDocument.css"></style>
