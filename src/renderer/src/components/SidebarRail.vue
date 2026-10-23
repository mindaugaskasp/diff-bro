<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useShareStore } from '../features/share'
import { useSettingsStore } from '../stores/settingsStore'
import { useRailKeys } from '../composables/useRailKeys'
import { useSectionReorder } from '../composables/useSectionReorder'
import AppIcon from './AppIcon.vue'

const emit = defineEmits(['select'])
const settings = useSettingsStore()
const vault = useVaultStore()
const snippets = useSnippetStore()
const share = useShareStore()
share.refreshTrusted()

const ITEMS = {
  home: { icon: 'home', labelKey: 'sidebarRail.home', count: () => 0 },
  diffs: { icon: 'diff', labelKey: 'sidebarRail.diffs', count: () => vault.active.length },
  snippets: {
    icon: 'code',
    labelKey: 'sidebarRail.snippets',
    count: () => snippets.entries.length
  },
  tools: { icon: 'grid', labelKey: 'sidebarRail.tools', count: () => 0 },
  keys: { icon: 'key', labelKey: 'sidebarRail.keys', count: () => share.trusted.length }
}
const SECTION_OF = { diffs: 'saved', snippets: 'snippets', tools: 'tools' }
// Keys is pinned to the foot of the rail: not a place you reorder, a place you go.
const order = computed(() => [...settings.railOrder, 'keys'])
const items = computed(() =>
  order.value.map((id) => ({
    id,
    ...ITEMS[id],
    count: ITEMS[id].count(),
    section: SECTION_OF[id] ?? null
  }))
)
const reorder = useSectionReorder()
const onClick = (id) => {
  if (!reorder.consumeClickSuppression()) select(id)
}
const press = (item, e) => item.section && reorder.onPointerDown(item.section, e)
const isOpen = (id) => !settings.sidebarCollapsed && settings.sidebarPanel === id

function select(id) {
  settings.setSidebarPanel(id)
  settings.setSidebarCollapsed(false)
  emit('select', id)
}
const onKeydown = useRailKeys(
  order,
  computed(() => settings.sidebarPanel),
  select
)
const toggleKey = computed(() =>
  settings.sidebarCollapsed ? 'sidebarRail.expandTheSidebar' : 'sidebarSearch.collapseTheSidebar'
)
</script>

<template>
  <nav class="rail" :aria-label="$t('sidebarRail.label')" @keydown="onKeydown">
    <div class="rail-band band">
      <button
        class="btn btn-icon sidebar-toggle"
        :data-tip="$t(toggleKey)"
        :aria-label="$t(toggleKey)"
        @click="settings.setSidebarCollapsed(!settings.sidebarCollapsed)"
      >
        <AppIcon :name="settings.sidebarCollapsed ? 'chevron-right' : 'chevron-left'" />
      </button>
    </div>
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="rail-item"
      :class="{
        on: isOpen(item.id),
        pinned: item.id === 'keys',
        'drop-target': item.section && reorder.isDropTarget(item.section),
        dragging: item.section && reorder.isDragging(item.section)
      }"
      :data-panel="item.id"
      :data-section="item.section"
      :data-reorder-handle="item.section ? '' : null"
      :aria-pressed="isOpen(item.id)"
      :aria-label="item.count ? `${$t(item.labelKey)}, ${item.count}` : $t(item.labelKey)"
      @click="onClick(item.id)"
      @dragstart.prevent
      @pointerdown="press(item, $event)"
      @pointermove="reorder.onPointerMove"
      @pointerup="reorder.onPointerUp"
      @pointercancel="reorder.onCancel"
    >
      <span class="rail-well">
        <AppIcon :name="item.icon" />
        <span v-if="item.count" class="count-pill rail-count">{{
          item.count > 99 ? '99+' : item.count
        }}</span>
      </span>
      <span class="rail-label">{{ $t(item.labelKey) }}</span>
    </button>
  </nav>
</template>

<style scoped src="./styles/SidebarRail.css"></style>
