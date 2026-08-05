<script setup>
// The "Secret" checkbox and the line explaining what it does. Its own component
// so SnippetEditorDialog's template stays inside its cap.
//
// <i18n-t> keeps the sentence whole: the bold label sits INSIDE the message as a
// slot, so a language that puts it elsewhere still reads correctly.
defineProps({
  modelValue: { type: Boolean, required: true },
  readonly: { type: Boolean, default: false }
})
defineEmits(['update:modelValue'])
</script>

<template>
  <label
    class="secret-toggle"
    :data-tip="$t('snippetEditorDialog.keepTheContentsMaskedEverywhere')"
  >
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="readonly"
      @change="$emit('update:modelValue', $event.target.checked)"
    />
    <i18n-t keypath="snippetEditorDialog.secretHint" tag="span">
      <template #label
        ><strong>{{ $t('snippetEditorDialog.secret') }}</strong></template
      >
    </i18n-t>
  </label>
</template>

<style scoped src="./styles/SnippetEditorDialog.css"></style>
