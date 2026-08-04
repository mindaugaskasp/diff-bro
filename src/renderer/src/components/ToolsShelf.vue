<script setup>
// Only the recents live here; the full list is the palette's tools scope, so
// there is no second searchable tool UI to keep in step.
import { computed } from 'vue'
import { useCommands } from '../composables/useCommands'
import { useSettingsStore } from '../stores/settingsStore'
import { SHELF_RECENT_TOOLS, recentTools } from '../utils/tools'
import AppIcon from './AppIcon.vue'
import { useUiStore } from '../stores/uiStore'

const ui = useUiStore()
const { run } = useCommands()
const settings = useSettingsStore()

const recent = computed(() => recentTools(settings.recentTools, SHELF_RECENT_TOOLS))
</script>

<template>
  <!-- The label names what the chips ARE. With nothing used yet it would be a
       heading over an empty row, so it appears with the first chip. -->
  <div v-if="recent.length" class="usb-tools usb-recent-strip">
    <div class="usb-recent">
      <span class="usb-tools-label"><AppIcon name="wrench" /> Recent tools</span>
      <div class="usb-recent-row">
        <button
          v-for="tool in recent"
          :key="tool.id"
          class="usb-tool"
          :data-tip="`${tool.kind} — ${tool.name}`"
          @click="run(tool.action)"
        >
          <AppIcon :name="tool.icon" />{{ tool.name }}
        </button>
      </div>
    </div>
  </div>
  <!-- Its own band, the same height as the status band across the divider, so
       the two bottom strips line up by construction however many chips the
       recents row grows. -->
  <div class="usb-tools usb-tools-search band band-row">
    <button
      class="usb-tool usb-tool-all"
      data-tip="Search every tool"
      @click="ui.openToolsPalette()"
    >
      <AppIcon name="search" />Search tools…
    </button>
  </div>
</template>

<style scoped src="./styles/ToolsShelf.css"></style>
