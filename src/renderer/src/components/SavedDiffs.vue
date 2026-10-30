<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSidebarResize } from '../composables/useSidebarResize'
import { useSidebarTags } from '../composables/useSidebarTags'
import HomePanel from './HomePanel.vue'
import DiffsPanel from './DiffsPanel.vue'
import SnippetsPanel from './SnippetsPanel.vue'
import { ToolsSection } from '../features/tools'
import { KeysPanel } from '../features/share'
import TagManagePopover from './TagManagePopover.vue'
import AppIcon from './AppIcon.vue'
import SidebarNav from './SidebarNav.vue'
import SidebarEdge from './SidebarEdge.vue'
import SidebarSearch from './SidebarSearch.vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'

const vault = useVaultStore()
const settings = useSettingsStore()
const ui = useUiStore()
const tags = useSidebarTags()
const size = useSidebarResize()

const aside = ref(null)
// Published so the toolbar's key buttons can centre on this column.
let observer = null
onMounted(() => {
  observer = new ResizeObserver(([entry]) =>
    document.documentElement.style.setProperty('--sidebar-w', `${entry.contentRect.width}px`)
  )
  if (aside.value) observer.observe(aside.value)
})
onBeforeUnmount(() => observer?.disconnect())

let timer = null
onMounted(() => {
  vault.tick()
  // 1 s tick keeps the countdowns live and purges entries the moment they expire.
  timer = setInterval(() => vault.tick(), 1000)
})
onBeforeUnmount(() => clearInterval(timer))

const PANEL_VIEW = {
  home: HomePanel,
  diffs: DiffsPanel,
  snippets: SnippetsPanel,
  tools: ToolsSection,
  keys: KeysPanel
}
const panel = computed(() => settings.sidebarPanel)
const filterable = computed(() => panel.value === 'diffs' || panel.value === 'snippets')
// A leading # is choosing a tag scope, not searching for "#…".
const search = computed(() => (ui.sidebarQuery.startsWith('#') ? '' : ui.sidebarQuery))
const panelProps = computed(() =>
  panel.value === 'home'
    ? { search: search.value }
    : {
        search: search.value,
        tags: filterable.value ? tags.active.value : []
      }
)
const SEARCH_KEY = {
  home: 'savedDiffs.searchIn.home',
  diffs: 'savedDiffs.searchIn.diffs',
  snippets: 'savedDiffs.searchIn.snippets',
  tools: 'savedDiffs.searchIn.tools',
  keys: 'savedDiffs.searchIn.keys'
}
const managing = ref('')
// The # chip in the search box: one tag path, kept as the sidebar's tag filter.
const scope = computed({
  get: () => tags.active.value[0] ?? '',
  set: (path) => (ui.sidebarTags = path ? [path] : [])
})
</script>

<template>
  <aside
    ref="aside"
    class="saved"
    :class="{ collapsed: settings.sidebarCollapsed, resizing: size.resizing.value }"
    :style="settings.sidebarCollapsed ? null : { width: `${size.width.value}px` }"
    data-tour="sidebar"
  >
    <SidebarEdge v-if="settings.sidebarCollapsed" collapsed />
    <div v-else class="usb-panel" :data-panel="panel">
      <SidebarNav />
      <div class="usb-controls band">
        <div class="usb-find band">
          <SidebarSearch
            v-model="ui.sidebarQuery"
            v-model:scope="scope"
            :placeholder="$t(SEARCH_KEY[panel])"
            :tags="filterable ? tags.namesIn(panel) : []"
          />
          <button
            v-if="panel === 'tools'"
            class="btn btn-icon usb-star"
            :data-tip="$t('tools.section.searchEveryTool')"
            :aria-label="$t('tools.section.searchEveryTool')"
            @click="ui.openToolsPalette()"
          >
            <AppIcon name="search" />
          </button>
        </div>
      </div>
      <TagManagePopover v-if="managing" :name="managing" @close="managing = ''" />
      <div class="usb-scroll">
        <component :is="PANEL_VIEW[panel]" v-bind="panelProps" @manage-tag="managing = $event" />
      </div>
      <SidebarEdge @resize="size.start" />
    </div>
  </aside>
</template>

<style scoped src="./styles/SavedDiffs.css"></style>
