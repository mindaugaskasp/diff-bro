<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSidebarResize } from '../composables/useSidebarResize'
import { useSidebarTags } from '../composables/useSidebarTags'
import { useTagShelf } from '../composables/useTagShelf'
import HomePanel from './HomePanel.vue'
import DiffsPanel from './DiffsPanel.vue'
import SnippetsPanel from './SnippetsPanel.vue'
import { ToolsSection } from '../features/tools'
import { KeysPanel } from '../features/share'
import TagManagePopover from './TagManagePopover.vue'
import TagPickerPopover from './TagPickerPopover.vue'
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

const ONE_CHIP_ROW_PX = 20
const shelfEl = ref(null)
const shelf = useTagShelf(shelfEl, {
  all: tags.all,
  active: tags.active,
  height: computed(() => ONE_CHIP_ROW_PX)
})

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
const panelProps = computed(() =>
  panel.value === 'home'
    ? { search: ui.sidebarQuery }
    : {
        search: ui.sidebarQuery,
        tags: filterable.value ? tags.active.value : [],
        favOnly: filterable.value && favOnly.value,
        panel: true,
        first: true
      }
)
const SEARCH_KEY = {
  home: 'savedDiffs.searchIn.home',
  diffs: 'savedDiffs.searchIn.diffs',
  snippets: 'savedDiffs.searchIn.snippets',
  tools: 'savedDiffs.searchIn.tools',
  keys: 'savedDiffs.searchIn.keys'
}
const favOnly = ref(false)
const managing = ref('')
const showAllTags = ref(false)
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
          <SidebarSearch v-model="ui.sidebarQuery" :placeholder="$t(SEARCH_KEY[panel])" />
          <button
            v-if="filterable"
            class="btn btn-icon usb-star"
            :class="{ on: favOnly }"
            :data-tip="$t('savedDiffs.showOnlyDiffsAndSnippets')"
            :aria-label="$t('savedDiffs.showOnlyStarredDiffsAnd')"
            :aria-pressed="favOnly"
            @click="favOnly = !favOnly"
          >
            <AppIcon name="star-filled" />
          </button>
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
        <div v-if="filterable && tags.all.value.length" ref="shelfEl" class="usb-shelf">
          <button
            v-for="t in shelf.bar.value"
            :key="t.name"
            class="tag-chip usb-tag"
            :class="{ on: tags.active.value.includes(t.name) }"
            :style="{ '--tc': t.color }"
            :data-tag="t.name"
            :data-tip="$t('savedDiffs.filterByTag', { name: t.name })"
            @click="tags.pick(t.name)"
            @contextmenu.prevent="managing = t.name"
          >
            <span class="usb-dot" />{{ t.name }}
            <span class="usb-tct">{{ t.count }}</span>
          </button>
          <button
            v-if="shelf.overflow.value > 0"
            class="tag-chip usb-more"
            :data-tip="$t('savedDiffs.collapsedTagsSearchable')"
            @click="showAllTags = true"
          >
            {{ $t('savedDiffs.plusMore', { n: shelf.overflow.value }) }}
          </button>
        </div>
        <div v-if="filterable && tags.active.value.length" class="usb-filtering">
          <span>{{ $t('savedDiffs.tagsSelected', tags.active.value.length) }}</span>
          <button
            class="usb-clear"
            :data-tip="$t('savedDiffs.dropEveryTagFilter')"
            @click="tags.clear()"
          >
            {{ $t('savedDiffs.clear') }}
          </button>
        </div>
      </div>
      <TagManagePopover v-if="managing" :name="managing" @close="managing = ''" />
      <TagPickerPopover
        v-if="showAllTags"
        :tags="shelf.hidden.value"
        :active="tags.active.value"
        @pick="tags.pick"
        @close="showAllTags = false"
      />
      <div class="usb-scroll">
        <component :is="PANEL_VIEW[panel]" v-bind="panelProps" />
      </div>
      <SidebarEdge @resize="size.start" />
    </div>
  </aside>
</template>

<style scoped src="./styles/SavedDiffs.css"></style>
