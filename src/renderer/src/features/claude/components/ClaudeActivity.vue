<script setup>
import { onMounted } from 'vue'
import { useClaudeStore } from '../claudeStore'
import { ago } from '../../../utils/relativeTime'

const claude = useClaudeStore()
onMounted(() => claude.loadActivity())
</script>

<template>
  <div class="activity-head">
    <h4>{{ $t('claude.activity.title') }}</h4>
    <button
      v-if="claude.activity.length"
      type="button"
      class="btn btn-sm"
      @click="claude.clearActivity()"
    >
      {{ $t('claude.activity.clear') }}
    </button>
  </div>
  <p v-if="!claude.activity.length" class="activity-empty">{{ $t('claude.activity.empty') }}</p>
  <ol v-else class="activity-list">
    <li v-for="(entry, i) in claude.activity" :key="`${entry.at}-${i}`">
      <code>{{ entry.tool }}</code>
      <span class="activity-item">{{ entry.item ?? '' }}</span>
      <span class="activity-age">{{ ago(entry.at) }}</span>
    </li>
  </ol>
</template>

<style scoped src="../../../components/styles/SettingsDialog.css"></style>
<style scoped src="./styles/ClaudeActivity.css"></style>
