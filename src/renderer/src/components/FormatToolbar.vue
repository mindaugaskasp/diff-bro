<script setup>
// Formatting toolbar for the snippet editor's rich-markup languages. Each button
// emits its action id; the buttons + transforms live in the per-language markup
// util (jiraMarkup / markdownMarkup), passed in as `actions`.
import { arrayOfShape } from '../utils/props'
import AppIcon from './AppIcon.vue'

defineProps({
  /** @type {import('../types').MarkupAction[]} */
  actions: { type: Array, required: true, validator: arrayOfShape('id') }
})
defineEmits(['action'])
</script>

<template>
  <div class="format-toolbar band" role="toolbar" aria-label="Formatting">
    <button
      v-for="a in actions"
      :key="a.id"
      type="button"
      class="fmt-btn"
      :class="{ 'fmt-btn-text': a.text }"
      :data-tip="a.title"
      :aria-label="a.title"
      @mousedown.prevent
      @click="$emit('action', a.id)"
    >
      <AppIcon v-if="a.icon" :name="a.icon" />
      <span v-else>{{ a.text }}</span>
    </button>
  </div>
</template>

<style scoped src="./styles/FormatToolbar.css"></style>
