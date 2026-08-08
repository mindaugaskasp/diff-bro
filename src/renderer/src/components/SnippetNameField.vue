<script setup>
// A snippet-name input with inline completion (see useNameComplete). The
// WRAPPER carries the visible box and the input inside is bare — an input with
// its own background paints over the ghost behind it, which is what shipped.
import { toRef } from 'vue'
import { useSnippetNameComplete } from '../composables/useSnippetNameComplete'

const props = defineProps({
  placeholder: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  /** A selector hook for the surface; styling belongs to this component. */
  inputClass: { type: String, default: '' }
})
const name = defineModel({ type: String, required: true })

const { inputEl, overlayEl, ghost, onKeydown, onScroll } = useSnippetNameComplete(
  name,
  toRef(props, 'readonly')
)
</script>

<template>
  <div class="ghost-field" :class="{ ro: readonly }">
    <!-- prettier-ignore — whitespace between these tags RENDERS, shifting the
         ghost off the caret. e2e asserts the overlay reads exactly typed+ghost. -->
    <span ref="overlayEl" class="ghost-layer" aria-hidden="true"
      ><span class="ghost-typed">{{ name }}</span
      ><span class="ghost-rest name-ghost">{{ ghost }}</span></span
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
</template>

<style scoped src="./styles/SnippetNameField.css"></style>
