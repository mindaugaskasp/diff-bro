<script setup>
// The sidebar's tools shelf: the few tools you actually reach for, plus one way
// into all of them. Recents come from settings and are capped at five, so the
// shelf stays one or two rows instead of the twelve-pill wall it replaced; the
// full list lives in the command palette's tools scope (one searchable list,
// not a second parallel UI).
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
      :title="`${tool.kind} — ${tool.name}`"
      @click="diff.handleMenuAction(tool.action)"
    >
      <AppIcon :name="tool.icon" />{{ tool.name }}
    </button>
    <button
      class="usb-tool usb-tool-all"
      :class="{ solo: !recent.length }"
      title="Search every tool"
      @click="diff.openToolsPalette()"
    >
      <AppIcon name="search" />{{ recent.length ? 'All tools' : 'Search tools…' }}
    </button>
  </div>
</template>

<style scoped src="./styles/ToolsShelf.css"></style>
