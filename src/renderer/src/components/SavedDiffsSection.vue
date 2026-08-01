<script setup>
// The "Saved diffs" group: your own encrypted, auto-expiring (or kept) diffs.
import { computed, ref } from 'vue'
import { matchesTags } from '../utils/tagFilter'
import { useVaultStore } from '../stores/vaultStore'
import SavedDiffRow from './SavedDiffRow.vue'
import SectionHeader from './SectionHeader.vue'
import { useTabsStore } from '../stores/tabsStore'
import { MAX_TABS } from '../utils/tabs'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  first: { type: Boolean, default: false },
  unified: { type: Boolean, default: false },
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] },
  favOnly: { type: Boolean, default: false }
})
const q = computed(() => props.search.trim().toLowerCase())
const matches = (e) =>
  (!q.value || e.name.toLowerCase().includes(q.value) || e.tags.some((t) => t.includes(q.value))) &&
  matchesTags(e.tags, props.tags)

const tabs = useTabsStore()
const vault = useVaultStore()
const open = ref(true)

// One list, favorites first; the ★ filter keeps only them.
const rows = computed(() =>
  (props.favOnly ? vault.favoritesOwn : [...vault.favoritesOwn, ...vault.ownActive]).filter(matches)
)
const hasOwn = computed(() => vault.active.some((e) => !e.from))
</script>

<template>
  <section class="sidebar-section">
    <SectionHeader
      section-id="saved"
      title="Saved diffs"
      icon="folder"
      :open="open"
      :first="first"
      :unified="unified"
      @toggle="open = !open"
    >
      <template #actions>
        <button
          class="btn btn-icon"
          :disabled="!tabs.canAdd"
          :data-tip="
            tabs.canAdd
              ? 'New comparison, ready for pasted text'
              : `That is the most comparisons at once (${MAX_TABS}) — close one first`
          "
          aria-label="New comparison from pasted text"
          @click.stop="tabs.newTab({ paste: true })"
        >
          <AppIcon name="plus" />
        </button>
      </template>
    </SectionHeader>

    <div v-show="open" class="section-body">
      <p v-if="!hasOwn" class="empty"><AppIcon name="inbox" /> Empty</p>
      <ul v-else class="rows">
        <!-- Filtered to nothing has to say so; a blank box reads as broken. -->
        <li v-if="!rows.length" class="empty small">
          No saved diffs match — try removing a filter.
        </li>
        <SavedDiffRow v-for="entry in rows" :key="entry.id" :entry="entry" />
      </ul>
    </div>
  </section>
</template>

<style scoped src="./styles/SavedDiffsSection.css"></style>
