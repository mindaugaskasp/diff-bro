<script setup>
// The sidebar shell: a search + a segmented filter (All / Saved / Shared /
// Snippets) over one scroll; each group is its own component.
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { toggleTag } from '../utils/tagFilter'
import { useVaultStore } from '../stores/vaultStore'
import { useSnippetStore } from '../stores/snippetStore'
import SavedDiffsSection from './SavedDiffsSection.vue'
import ExternalDiffsSection from './ExternalDiffsSection.vue'
import SnippetsPanel from './SnippetsPanel.vue'
import ToolsShelf from './ToolsShelf.vue'
import AppIcon from './AppIcon.vue'

const vault = useVaultStore()
const snippets = useSnippetStore()

let timer = null
onMounted(() => {
  vault.tick()
  // 1 s tick keeps the countdowns live and purges entries the moment they expire.
  timer = setInterval(() => vault.tick(), 1000)
})
onBeforeUnmount(() => clearInterval(timer))

// Section toggles are multi-select; "All" shows all, "★" narrows to favorites.
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

// One tag filter across the sidebar: the union of diff + snippet tags, most-used
// first.
const activeTags = ref([])
const allTags = computed(() => {
  const counts = {}
  for (const e of vault.entries) for (const t of e.tags || []) counts[t] = (counts[t] || 0) + 1
  for (const e of snippets.entries) for (const t of e.tags || []) counts[t] = (counts[t] || 0) + 1
  return Object.keys(counts)
    .map((name) => ({
      name,
      color: snippets.colorOf(name) || 'var(--text-dim)',
      count: counts[name]
    }))
    .sort((a, b) => b.count - a.count)
})
const pickTag = (name) => (activeTags.value = toggleTag(activeTags.value, name))
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
        <button
          v-if="query"
          class="usb-x"
          data-tip="Clear the search box"
          aria-label="Clear search"
          @click="query = ''"
        >
          <AppIcon name="x" />
        </button>
      </div>
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
      <div v-if="allTags.length" class="usb-tags">
        <button
          v-for="t in allTags"
          :key="t.name"
          class="tag-chip usb-tag"
          :class="{ on: activeTags.includes(t.name) }"
          :style="{ '--tc': t.color }"
          @click="pickTag(t.name)"
        >
          <span class="usb-dot" />{{ t.name }}
          <span class="usb-tct">{{ t.count }}</span>
        </button>
      </div>
    </div>
    <div class="usb-scroll">
      <SavedDiffsSection
        v-show="shows('saved')"
        unified
        :search="query"
        :tags="activeTags"
        :fav-only="favOnly"
      />
      <ExternalDiffsSection
        v-show="shows('shared')"
        unified
        :search="query"
        :tags="activeTags"
        :fav-only="favOnly"
      />
      <SnippetsPanel
        v-show="shows('snippets')"
        unified
        :search="query"
        :tags="activeTags"
        :fav-only="favOnly"
      />
    </div>
    <ToolsShelf />
  </aside>
</template>

<style scoped src="./styles/SavedDiffs.css"></style>
