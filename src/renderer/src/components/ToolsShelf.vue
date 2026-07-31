<script setup>
// Only the recents live here; the full list is the palette's tools scope, so
// there is no second searchable tool UI to keep in step.
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSettingsStore } from '../stores/settingsStore'
import { recentTools } from '../utils/tools'
import AppIcon from './AppIcon.vue'

const diff = useDiffStore()
const settings = useSettingsStore()

const recent = computed(() => recentTools(settings.recentTools))
</script>

<template>
  <div class="usb-tools band">
    <span class="usb-tools-label"><AppIcon name="wrench" /> Tools</span>
    <button
      v-for="tool in recent"
      :key="tool.id"
      class="usb-tool"
      :data-tip="`${tool.kind} — ${tool.name}`"
      @click="diff.handleMenuAction(tool.action)"
    >
      <AppIcon :name="tool.icon" />{{ tool.name }}
    </button>
    <button
      class="usb-tool usb-tool-all"
      :class="{ solo: !recent.length }"
      data-tip="Search every tool"
      @click="diff.openToolsPalette()"
    >
      <AppIcon name="search" />{{ recent.length ? 'All tools' : 'Search tools…' }}
    </button>
  </div>
</template>

<style scoped src="./styles/ToolsShelf.css"></style>
