<script setup>
// Formatting toolbar for the snippet editor's rich-markup languages. Each button
// emits its action id; the buttons + transforms live in the per-language markup
// util (jiraMarkup / markdownMarkup), passed in as `actions`.
import { arrayOfShape } from '../utils/props'
import AppIcon from './AppIcon.vue'
import { t } from '../i18n'

defineProps({
  /** @type {import('../types').MarkupAction[]} */
  actions: { type: Array, required: true, validator: arrayOfShape('id') }
})
defineEmits(['action'])

// Label and syntax are joined here rather than stored joined: the syntax is the
// language's own grammar and must never be translated.
const tip = (a) => t('formatToolbar.tip', { label: t(a.labelKey), syntax: a.syntax })
</script>

<template>
  <div class="format-toolbar band" role="toolbar" :aria-label="$t('formatToolbar.label')">
    <button
      v-for="a in actions"
      :key="a.id"
      type="button"
      class="fmt-btn"
      :class="{ 'fmt-btn-text': a.text }"
      :data-tip="tip(a)"
      :aria-label="tip(a)"
      @mousedown.prevent
      @click="$emit('action', a.id)"
    >
      <AppIcon v-if="a.icon" :name="a.icon" />
      <span v-else>{{ a.text }}</span>
    </button>
  </div>
</template>

<style scoped src="./styles/FormatToolbar.css"></style>
