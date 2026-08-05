<script setup>
// The sidebar collapsed to a strip. Nothing is removed, only abbreviated: every
// section is still here with its count, and opens the sidebar on the way to
// what was asked for. Expanding has its own control, so it never means picking
// a section you did not want.
import { computed, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useCommands } from '../composables/useCommands'
import { TOOLS } from '../utils/tools'
import { useFittingCount } from '../composables/useFittingCount'
import AppIcon from './AppIcon.vue'
import { useUiStore } from '../stores/uiStore'
import { useToolsStore } from '../features/tools'

const emit = defineEmits(['expand'])
const vault = useVaultStore()
const ui = useUiStore()
const snippets = useSnippetStore()
const toolsStore = useToolsStore()
const { run } = useCommands()

// As many as the leftover column holds, so the rail neither wastes the space nor
// clips an icon in half. A button occupies its own height plus the gap above it.
const tools = ref(null)
const px = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
const fits = useFittingCount(tools, {
  item: () => px('--control-h') + px('--space-2'),
  max: () => TOOLS.length
})
// The same ordering the expanded section uses — pinned first, then registry
// order — so collapsing the sidebar never rearranges the list. Opened straight
// from the rail: reaching a tool must not cost the collapse.
const railTools = computed(() => toolsStore.railRows(fits.value))

const groups = computed(() => [
  {
    id: 'saved',
    icon: 'folder',
    label: 'Saved diffs',
    count: vault.active.filter((e) => !e.from).length
  },
  { id: 'external', icon: 'share', label: 'External diffs', count: vault.importedActive.length },
  { id: 'snippets', icon: 'code', label: 'Snippets', count: snippets.entries.length }
])
</script>

<template>
  <div class="rail">
    <!-- The band the expanded sidebar puts its collapse control in, holding the
         same control in its other state. The toggle never moves. -->
    <div class="rail-band band">
      <button
        class="btn btn-icon sidebar-toggle"
        data-tip="Expand the sidebar"
        aria-label="Expand the sidebar"
        @click="emit('expand', null)"
      >
        <AppIcon name="chevron-right" />
      </button>
    </div>

    <button
      class="rail-btn"
      data-tip="Search diffs & snippets"
      aria-label="Search diffs and snippets"
      @click="emit('expand', 'search')"
    >
      <AppIcon name="search" />
    </button>

    <button
      v-for="g in groups"
      :key="g.id"
      class="rail-btn"
      :data-tip="`${g.label} (${g.count})`"
      :aria-label="`${g.label}, ${g.count}`"
      @click="emit('expand', g.id)"
    >
      <AppIcon :name="g.icon" />
      <span v-if="g.count" class="rail-count">{{ g.count > 99 ? '99+' : g.count }}</span>
    </button>

    <!-- Tools, under the same rule the search band carries. Each opens where it
         stands, so reaching one never costs the collapse. The box below the rule
         is always in the layout and always measurable. -->
    <div class="rail-rule"></div>
    <div ref="tools" class="rail-recent">
      <button
        v-for="tool in railTools"
        :key="tool.id"
        class="rail-btn"
        :class="{ pinned: tool.pinned }"
        :data-tip="$t('toolRow.tip', { kind: tool.kind, name: tool.name })"
        :aria-label="`${tool.kind} ${tool.name}`"
        @click="run(tool.action)"
      >
        <AppIcon :name="tool.icon" />
      </button>
    </div>

    <!-- The full list, searchable, without giving up the collapse. -->
    <button
      class="rail-btn"
      data-tip="Search every tool"
      aria-label="Tools"
      @click="ui.openToolsPalette()"
    >
      <AppIcon name="wrench" />
    </button>
  </div>
</template>

<style scoped src="./styles/SidebarRail.css"></style>
