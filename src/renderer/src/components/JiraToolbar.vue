<script setup>
// Formatting toolbar for Jira / Confluence wiki markup, shown above the snippet
// editor when that syntax is picked. Each button emits its action id; the parent
// applies the matching markup transform to the Monaco selection. The button set
// and the markup itself live in utils/jiraMarkup.js so they stay unit-testable.
import { JIRA_ACTIONS } from '../utils/jiraMarkup'
import AppIcon from './AppIcon.vue'

defineEmits(['action'])
</script>

<template>
  <div class="jira-toolbar band" role="toolbar" aria-label="Wiki markup formatting">
    <button
      v-for="a in JIRA_ACTIONS"
      :key="a.id"
      type="button"
      class="jira-btn"
      :class="{ 'jira-btn-text': a.text }"
      :title="a.title"
      :aria-label="a.title"
      @mousedown.prevent
      @click="$emit('action', a.id)"
    >
      <AppIcon v-if="a.icon" :name="a.icon" />
      <span v-else>{{ a.text }}</span>
    </button>
  </div>
</template>

<style scoped src="./styles/JiraToolbar.css"></style>
