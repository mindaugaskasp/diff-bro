<script setup>
// Syntax-coloured code. Every run is drawn as text through interpolation — no
// markup is generated and none is adopted, so rule 8 holds.
import { watch } from 'vue'
import { useHighlightedCode } from '../composables/useHighlightedCode'

const props = defineProps({
  code: { type: String, required: true },
  language: { type: String, default: '' }
})
// For a reader that gets one look at this — the screenshot stage.
const emit = defineEmits(['settled'])
const { lines, settled } = useHighlightedCode(
  () => props.code,
  () => props.language
)
watch(settled, (done) => done && emit('settled'), { immediate: true })
</script>

<template>
  <code class="syn">
    <span v-for="(spans, i) in lines" :key="i" class="syn-line">
      <span v-for="(span, j) in spans" :key="j" :class="span.role && `syn-${span.role}`">{{
        span.text
      }}</span>
    </span>
  </code>
</template>

<style scoped src="./styles/SnippetCode.css"></style>
