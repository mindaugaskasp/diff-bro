<script setup>
// The sidebar collapsed to a strip. Nothing is removed, only abbreviated: every
// section is still here with its count, and opens the sidebar on the way to
// what was asked for. Expanding has its own control, so it never means picking
// a section you did not want.
import { computed, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useCommands } from '../composables/useCommands'
import { TOOLS, namedTools } from '../utils/tools'
import { t } from '../i18n'
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
// Resolved here, like every other tool surface: raw rows carry nameKey/kindKey
// and would render "undefined undefined" into the tooltip and the aria-label.
const railTools = computed(() => namedTools(toolsStore.railRows(fits.value), t))

const groups = computed(() => [
  {
    id: 'saved',
    icon: 'folder',
    labelKey: 'savedDiffsSection.savedDiffs',
    count: vault.active.filter((e) => !e.from).length
  },
  {
    id: 'external',
    icon: 'share',
    labelKey: 'externalDiffsSection.externalDiffs',
    count: vault.importedActive.length
  },
  {
    id: 'snippets',
    icon: 'code',
    labelKey: 'snippetsPanel.snippets',
    count: snippets.entries.length
  }
])
</script>

<template>
  <div class="rail">
    <!-- The band the expanded sidebar puts its collapse control in, holding the
         same control in its other state. The toggle never moves. -->
    <div class="rail-band band">
      <button
        class="btn btn-icon sidebar-toggle"
        :data-tip="$t('sidebarRail.expandTheSidebar')"
        :aria-label="$t('sidebarRail.expandTheSidebar')"
        @click="emit('expand', null)"
      >
        <AppIcon name="chevron-right" />
      </button>
    </div>

    <button
      class="rail-btn"
      :data-tip="$t('sidebarRail.searchDiffsSnippets')"
      :aria-label="$t('sidebarRail.searchDiffsAndSnippets')"
      @click="emit('expand', 'search')"
    >
      <AppIcon name="search" />
    </button>

    <button
      v-for="g in groups"
      :key="g.id"
      class="rail-btn"
      :data-tip="`${$t(g.labelKey)} (${g.count})`"
      :aria-label="`${$t(g.labelKey)}, ${g.count}`"
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
      :data-tip="$t('sidebarRail.searchEveryTool')"
      :aria-label="$t('sidebarRail.tools')"
      @click="ui.openToolsPalette()"
    >
      <AppIcon name="wrench" />
    </button>
  </div>
</template>

<style scoped src="./styles/SidebarRail.css"></style>
