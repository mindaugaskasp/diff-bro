<script setup>
// Live Markdown preview: parse to the shared block tree (markdownRender) and draw
// it through the same renderer the Jira preview uses — real DOM via
// interpolation, never v-html (rule 7).
import { computed } from 'vue'
import { parseMarkdown } from '../utils/markdownRender'
import JiraRendered from './JiraRendered.vue'

const props = defineProps({ content: { type: String, default: '' } })
const blocks = computed(() => parseMarkdown(props.content))
</script>

<template>
  <JiraRendered :blocks="blocks" />
</template>
