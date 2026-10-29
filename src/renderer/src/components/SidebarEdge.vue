<script setup>
// Shows and hides the sidebar from its edge (#144, Q13): a handle on the seam
// while it is open, a strip at the window's left edge while it is collapsed.
import { MOD } from '../keys'
import { useSettingsStore } from '../stores/settingsStore'
import AppIcon from './AppIcon.vue'

defineProps({ collapsed: { type: Boolean, default: false } })
defineEmits(['resize'])
const settings = useSettingsStore()
</script>

<template>
  <div v-if="collapsed" class="sidebar-strip">
    <button
      type="button"
      class="edge-pill strip-pill"
      :aria-label="$t('sidebarNav.show')"
      :data-tip="$t('sidebarNav.showTip', { mod: MOD })"
      @click="settings.setSidebarCollapsed(false)"
    >
      <AppIcon name="chevron-right" />
    </button>
  </div>
  <template v-else>
    <!-- Widen only: narrower truncates every name without freeing space. -->
    <div
      class="usb-grip"
      role="separator"
      aria-orientation="vertical"
      :aria-label="$t('savedDiffs.dragToWidenTheSidebar')"
      @pointerdown="$emit('resize', $event)"
    ></div>
    <button
      type="button"
      class="edge-pill sidebar-handle"
      :aria-label="$t('sidebarNav.hide')"
      :data-tip="$t('sidebarNav.hideTip', { mod: MOD })"
      @click="settings.setSidebarCollapsed(true)"
    >
      <AppIcon name="chevron-left" />
    </button>
  </template>
</template>

<style scoped src="./styles/SidebarEdge.css"></style>
