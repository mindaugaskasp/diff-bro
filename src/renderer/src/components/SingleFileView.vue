<script setup>
import { ref, watch } from 'vue'
import { useMonacoInput } from '../composables/useMonacoInput'
import { shaped } from '../utils/props'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').TextComparable>} */
  comparable: { type: Object, required: true, validator: shaped('text', 'language') }
})

const container = ref(null)
const content = ref(props.comparable.text)
const language = ref(props.comparable.language)
watch(
  () => props.comparable,
  (c) => {
    content.value = c.text
    language.value = c.language
  }
)

useMonacoInput({ container, content, language, readOnly: ref(true) })
</script>

<template>
  <div ref="container" class="single-file" data-testid="single-file-view"></div>
</template>

<style scoped src="./styles/SingleFileView.css"></style>
