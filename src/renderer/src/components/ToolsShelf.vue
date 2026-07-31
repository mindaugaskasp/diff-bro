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
  <div class="usb-tools">
    <!-- The label names what the chips ARE. With nothing used yet it would be a
         heading over an empty row, so it appears with the first chip. -->
    <div v-if="recent.length" class="usb-recent">
      <span class="usb-tools-label"><AppIcon name="wrench" /> Recent tools</span>
      <div class="usb-recent-row">
        <button
          v-for="tool in recent"
          :key="tool.id"
          class="usb-tool"
          :data-tip="`${tool.kind} — ${tool.name}`"
          @click="diff.handleMenuAction(tool.action)"
        >
          <AppIcon :name="tool.icon" />{{ tool.name }}
        </button>
      </div>
    </div>
    <!-- The way into everything, always on its own line so it never wraps away
         from the pointer as recents accumulate. -->
    <button
      class="usb-tool usb-tool-all"
      data-tip="Search every tool"
      @click="diff.openToolsPalette()"
    >
      <AppIcon name="search" />Search tools…
    </button>
  </div>
</template>

<style scoped src="./styles/ToolsShelf.css"></style>
