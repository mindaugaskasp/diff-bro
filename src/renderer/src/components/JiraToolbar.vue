<script setup>
// Jira/Confluence formatting toolbar. Each button emits its action id; the
// buttons + transforms are in utils/jiraMarkup.js.
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
