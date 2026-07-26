<script setup>
// The sidebar shell (Option 2 — "one quiet list"): a single search + a segmented
// filter (All / Saved / Shared / Snippets) over one scroll, instead of three
// reorderable bands. Each group is still its own component (categories, favorites,
// tags all preserved) — just rendered with a light label and no drag-reorder.
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import SavedDiffsSection from './SavedDiffsSection.vue'
import ExternalDiffsSection from './ExternalDiffsSection.vue'
import SnippetsPanel from './SnippetsPanel.vue'
import AppIcon from './AppIcon.vue'

const vault = useVaultStore()
let timer = null
onMounted(() => {
  vault.tick()
  // 1 s tick keeps the countdowns live and purges entries the moment they expire.
  timer = setInterval(() => vault.tick(), 1000)
})
onBeforeUnmount(() => clearInterval(timer))

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'saved', label: 'Saved' },
  { id: 'shared', label: 'Shared' },
  { id: 'snippets', label: 'Snippets' }
]
const filter = ref('all')
const query = ref('')
const shows = (id) => filter.value === 'all' || filter.value === id
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
        <button
          v-for="f in FILTERS"
          :key="f.id"
          :class="{ on: filter === f.id }"
          @click="filter = f.id"
        >
          {{ f.label }}
        </button>
      </div>
    </div>
    <div class="usb-scroll">
      <SavedDiffsSection v-show="shows('saved')" unified :search="query" />
      <ExternalDiffsSection v-show="shows('shared')" unified :search="query" />
      <SnippetsPanel v-show="shows('snippets')" unified :search="query" />
    </div>
  </aside>
</template>

<style scoped src="./styles/SavedDiffs.css"></style>
