<script setup>
// The sidebar shell: a search + a segmented filter (All / Saved / External /
// Snippets) over one scroll; each group is its own component.
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSidebarResize } from '../composables/useSidebarResize'
import { useSidebarTags } from '../composables/useSidebarTags'
import SavedDiffsSection from './SavedDiffsSection.vue'
import ExternalDiffsSection from './ExternalDiffsSection.vue'
import SnippetsPanel from './SnippetsPanel.vue'
import { ToolsSection } from '../features/tools'
import TagManagePopover from './TagManagePopover.vue'
import TagPickerPopover from './TagPickerPopover.vue'
import AppIcon from './AppIcon.vue'
import SidebarRail from './SidebarRail.vue'
import SidebarSearch from './SidebarSearch.vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'

const vault = useVaultStore()
const settings = useSettingsStore()
const ui = useUiStore()
const tags = useSidebarTags()
const size = useSidebarResize()

const searchBox = ref(null)
const aside = ref(null)
// Published so the toolbar's key buttons can centre on this column whatever it
// is doing — dragged wider, collapsed to the rail, mid-transition. Measured
// rather than recomputed from the same numbers in two places.
let observer = null
onMounted(() => {
  observer = new ResizeObserver(([entry]) =>
    document.documentElement.style.setProperty('--sidebar-w', `${entry.contentRect.width}px`)
  )
  if (aside.value) observer.observe(aside.value)
})
onBeforeUnmount(() => observer?.disconnect())
// Opening from a rail icon lands on what was asked for: the search box focused,
// or that section shown on its own.
function expandTo(what) {
  settings.setSidebarCollapsed(false)
  if (what === 'search') return nextTick(() => searchBox.value?.focus())
  if (SECTIONS.some((sec) => sec.id === what)) visible.value = new Set([what])
}

let timer = null
onMounted(() => {
  vault.tick()
  // 1 s tick keeps the countdowns live and purges entries the moment they expire.
  timer = setInterval(() => vault.tick(), 1000)
})
onBeforeUnmount(() => clearInterval(timer))

// Section toggles are multi-select; "All" shows all, "★" narrows to favorites.
// The ids are settingsDefaults' SECTIONS, so the filter, the rail and the stored
// drag order all name the same four things.
const SECTIONS = [
  { id: 'saved', label: 'Saved' },
  { id: 'external', label: 'External' },
  { id: 'snippets', label: 'Snippets' },
  { id: 'tools', label: 'Tools' }
]
// Which component renders each, so the scroll can follow the stored order
// rather than the order they happen to be written in.
const SECTION_VIEW = {
  saved: SavedDiffsSection,
  external: ExternalDiffsSection,
  snippets: SnippetsPanel,
  tools: ToolsSection
}
const visible = ref(new Set(SECTIONS.map((s) => s.id)))
const favOnly = ref(false)
const allOn = computed(() => visible.value.size === SECTIONS.length)
const shows = (id) => visible.value.has(id)
function toggleSection(id) {
  const next = new Set(visible.value)
  if (next.has(id)) {
    if (next.size === 1) return // at least one section must stay shown
    next.delete(id)
  } else {
    next.add(id)
  }
  visible.value = next
}
function showAll() {
  visible.value = new Set(SECTIONS.map((s) => s.id))
}

// Right-click is the only way in: a tag chip's primary job is filtering, and a
// second visible control on every chip would crowd the bar.
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
    <SidebarRail v-if="settings.sidebarCollapsed" @expand="expandTo" />
    <template v-else>
      <div class="usb-controls band">
        <SidebarSearch
          ref="searchBox"
          v-model="ui.sidebarQuery"
          @collapse="settings.setSidebarCollapsed(true)"
        />
        <div class="usb-seg">
          <button :class="{ on: allOn }" data-tip="Show every sidebar section" @click="showAll">
            All
          </button>
          <button
            class="star"
            :class="{ on: favOnly }"
            data-tip="Show only diffs and snippets you starred"
            aria-label="Show only starred diffs and snippets"
            :aria-pressed="favOnly"
            @click="favOnly = !favOnly"
          >
            <AppIcon name="star-filled" />
          </button>
          <button
            v-for="s in SECTIONS"
            :key="s.id"
            :class="{ on: shows(s.id) }"
            @click="toggleSection(s.id)"
          >
            {{ s.label }}
          </button>
        </div>
        <div v-if="tags.all.value.length" class="usb-tags">
          <button
            v-for="t in tags.bar.value"
            :key="t.name"
            class="tag-chip usb-tag"
            :class="{ on: tags.active.value.includes(t.name) }"
            :style="{ '--tc': t.color }"
            :data-tip="`Filter by ${t.name} · right-click to manage`"
            @click="tags.pick(t.name)"
            @contextmenu.prevent="managing = t.name"
          >
            <span class="usb-dot" />{{ t.name }}
            <span class="usb-tct">{{ t.count }}</span>
          </button>
          <button
            v-if="tags.overflow.value > 0"
            class="tag-chip usb-more"
            data-tip="Every tag, searchable"
            @click="showAllTags = true"
          >
            +{{ tags.overflow.value }} more
          </button>
        </div>
        <div v-if="tags.active.value.length" class="usb-filtering">
          <span>
            {{ tags.active.value.length }} tag{{ tags.active.value.length === 1 ? '' : 's' }}
            selected
          </span>
          <button class="usb-clear" data-tip="Drop every tag filter" @click="tags.clear()">
            Clear
          </button>
        </div>
      </div>
      <TagManagePopover v-if="managing" :name="managing" @close="managing = ''" />
      <TagPickerPopover
        v-if="showAllTags"
        :tags="tags.all.value"
        :active="tags.active.value"
        @pick="tags.pick"
        @close="showAllTags = false"
      />

      <div class="usb-scroll">
        <component
          :is="SECTION_VIEW[id]"
          v-for="id in settings.orderedSections"
          v-show="shows(id)"
          :key="id"
          unified
          :search="ui.sidebarQuery"
          :tags="tags.active.value"
          :fav-only="favOnly"
        />
      </div>
      <!-- Widen only: the sidebar collapses to a rail for the other direction,
           and a half-narrow list truncates every name without freeing space. -->
      <div
        class="usb-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="Drag to widen the sidebar"
        @pointerdown="size.start"
      ></div>
    </template>
  </aside>
</template>

<style scoped src="./styles/SavedDiffs.css"></style>
