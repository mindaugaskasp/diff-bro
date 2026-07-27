<script setup>
// The sidebar shell (Option 2 — "one quiet list"): a single search + a segmented
// filter (All / Saved / Shared / Snippets) over one scroll, instead of three
// reorderable bands. Each group is still its own component (categories, favorites,
// tags all preserved) — just rendered with a light label and no drag-reorder.
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { TEXT_TOOLS } from '../utils/textTools'
import SavedDiffsSection from './SavedDiffsSection.vue'
import ExternalDiffsSection from './ExternalDiffsSection.vue'
import SnippetsPanel from './SnippetsPanel.vue'
import AppIcon from './AppIcon.vue'

const vault = useVaultStore()
const snippets = useSnippetStore()
const diff = useDiffStore()

// Tools pinned to the sidebar foot for one-click access — the same dialogs the
// Tools menu opens, in the same order. Base64 has its own dialog flag; the
// format/validate tools come from the TEXT_TOOLS registry (the single source).
const TOOLS = [
  { label: 'Base64', title: 'Base64 Encode / Decode', open: () => (diff.showBase64Dialog = true) },
  ...Object.keys(TEXT_TOOLS).map((id) => ({
    label: id.toUpperCase(),
    title: TEXT_TOOLS[id].title,
    open: () => (diff.textTool = id)
  })),
  {
    label: 'Replace',
    title: 'Find & Replace (characters, words, or regex)',
    open: () => (diff.showFindReplaceDialog = true)
  }
]
let timer = null
onMounted(() => {
  vault.tick()
  // 1 s tick keeps the countdowns live and purges entries the moment they expire.
  timer = setInterval(() => vault.tick(), 1000)
})
onBeforeUnmount(() => clearInterval(timer))

// The section toggles are MULTI-select — any combination of Saved / Shared /
// Snippets can be shown at once. "All" turns them all on; "★" narrows every
// shown section to favorites only.
const SECTIONS = [
  { id: 'saved', label: 'Saved' },
  { id: 'shared', label: 'Shared' },
  { id: 'snippets', label: 'Snippets' }
]
const visible = ref(new Set(SECTIONS.map((s) => s.id)))
const favOnly = ref(false)
const query = ref('')
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

// One tag filter across the whole sidebar: the union of tags on diffs AND
// snippets (colors from the shared registry), most-used first. Clicking a chip
// narrows every group to entries carrying that tag; clicking it again clears.
const activeTag = ref('')
const allTags = computed(() => {
  const counts = {}
  for (const e of vault.entries) for (const t of e.tags || []) counts[t] = (counts[t] || 0) + 1
  for (const e of snippets.entries) for (const t of e.tags || []) counts[t] = (counts[t] || 0) + 1
  return Object.keys(counts)
    .map((name) => ({ name, color: snippets.colorOf(name) || 'var(--text-dim)', count: counts[name] }))
    .sort((a, b) => b.count - a.count)
})
const toggleTag = (name) => (activeTag.value = activeTag.value === name ? '' : name)
</script>

<template>
  <aside class="saved">
    <div class="usb-controls band">
      <div class="usb-search">
        <AppIcon class="usb-glyph" name="search" />
        <input
          v-model="query"
          type="search"
          placeholder="Search diffs & snippets…"
          spellcheck="false"
        />
        <button v-if="query" class="usb-x" title="Clear search" @click="query = ''">
          <AppIcon name="x" />
        </button>
      </div>
      <div class="usb-seg">
        <button :class="{ on: allOn }" title="Show all sections" @click="showAll">All</button>
        <button
          class="star"
          :class="{ on: favOnly }"
          title="Favorites only"
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
      <div v-if="allTags.length" class="usb-tags">
        <button
          v-for="t in allTags"
          :key="t.name"
          class="usb-tag"
          :class="{ on: activeTag === t.name }"
          :style="{ '--tc': t.color }"
          @click="toggleTag(t.name)"
        >
          <span class="usb-dot" :style="{ background: t.color }" />{{ t.name }}
          <span class="usb-tct">{{ t.count }}</span>
        </button>
      </div>
    </div>
    <div class="usb-scroll">
      <SavedDiffsSection
        v-show="shows('saved')"
        unified
        :search="query"
        :tag="activeTag"
        :fav-only="favOnly"
      />
      <ExternalDiffsSection
        v-show="shows('shared')"
        unified
        :search="query"
        :tag="activeTag"
        :fav-only="favOnly"
      />
      <SnippetsPanel
        v-show="shows('snippets')"
        unified
        :search="query"
        :tag="activeTag"
        :fav-only="favOnly"
      />
    </div>
    <div class="usb-tools band">
      <span class="usb-tools-label">Tools</span>
      <button
        v-for="t in TOOLS"
        :key="t.label"
        class="usb-tool"
        :title="t.title"
        @click="t.open()"
      >
        {{ t.label }}
      </button>
    </div>
  </aside>
</template>

<style scoped src="./styles/SavedDiffs.css"></style>
