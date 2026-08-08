<script setup>
// A snippet-name input with inline completion. An overlay BEHIND the field
// draws the ghost, so it is never part of the value.
import { useSnippetNameComplete } from '../composables/useSnippetNameComplete'
import SnippetNameHint from './SnippetNameHint.vue'

defineProps({
  placeholder: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  inputClass: { type: String, default: '' },
  /** Show the {{token}} reference under the field — editor only; the launcher
      panel has no room and no template support. */
  templateHint: { type: Boolean, default: false }
})
const name = defineModel({ type: String, required: true })

const { inputEl, overlayEl, ghost, onKeydown, onScroll } = useSnippetNameComplete(name)
defineExpose({ focus: () => inputEl.value?.focus() })
</script>

<template>
  <div class="ghost-field">
    <span ref="overlayEl" class="ghost-layer" aria-hidden="true"
      ><span class="ghost-typed">{{ name }}</span
      ><span class="ghost-rest name-ghost">{{ readonly ? '' : ghost }}</span></span
    >
    <input
      ref="inputEl"
      v-model="name"
      :class="inputClass"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :placeholder="placeholder"
      :readonly="readonly"
      @keydown="onKeydown"
      @scroll="onScroll"
    />
  </div>
  <SnippetNameHint v-if="templateHint" :name="name" />
</template>
