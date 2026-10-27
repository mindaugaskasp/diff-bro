<script setup>
import { toRef } from 'vue'
import { useHighlightedInput } from '../composables/useHighlightedInput'

const props = defineProps({
  language: { type: String, required: true },
  placeholder: { type: String, default: '' },
  label: { type: String, required: true }
})
const text = defineModel({ type: String, required: true })
const { textareaEl, overlayEl, lines, isPlain, onScroll, onCompositionStart, onCompositionEnd } =
  useHighlightedInput({ text, language: toRef(props, 'language') })
</script>

<template>
  <div class="hl-field">
    <!-- prettier-ignore — whitespace between these tags renders and shifts every line. -->
    <pre ref="overlayEl" class="hl-layer" aria-hidden="true"><div
      v-for="(spans, i) in lines"
      :key="i"
    ><span
      v-for="(span, j) in spans"
      :key="j"
      :class="span.role && `syn-${span.role}`"
    >{{ span.text }}</span></div></pre>
    <textarea
      ref="textareaEl"
      v-model="text"
      class="hl-text"
      :class="{ plain: isPlain }"
      :placeholder="placeholder"
      :aria-label="label"
      spellcheck="false"
      @scroll="onScroll"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
    ></textarea>
  </div>
</template>

<style scoped src="./styles/HighlightedTextarea.css"></style>
