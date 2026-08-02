<script setup>
// The band that says this comparison is not the ordinary one. It states what a
// reader can observe — the file is read from disk as they scroll, and some
// actions are unavailable — never the reasoning behind it.
import { computed } from 'vue'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').StreamSummary|null>} */
  summary: {
    type: Object,
    default: null,
    validator: (v) => v === null || shaped('leftLines', 'rightLines')(v)
  },
  loading: { type: Boolean, default: false }
})

const capped = computed(() => !!props.summary?.truncated)
const cappedAt = computed(() => (props.summary?.maxLines ?? 0).toLocaleString())
</script>

<template>
  <div class="stream-mark band">
    <AppIcon name="stream" class="mark-icon" />
    <span class="mark-title">Streamed</span>
    <span class="mark-why">
      <template v-if="loading">Indexing both files by line…</template>
      <template v-else>Read from disk as you scroll — too large to load in full.</template>
    </span>
    <span v-if="capped" class="mark-capped">
      Only the first {{ cappedAt }} lines of each file are compared.
    </span>
    <span class="mark-limits">Saving, sharing and patch export are unavailable.</span>
  </div>
</template>

<style scoped src="./styles/StreamedMarker.css"></style>
