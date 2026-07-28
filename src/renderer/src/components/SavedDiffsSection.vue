<script setup>
// The "Saved diffs" group: your own encrypted, auto-expiring (or kept) diffs.
import { computed, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import SavedDiffRow from './SavedDiffRow.vue'
import SectionHeader from './SectionHeader.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  first: { type: Boolean, default: false },
  unified: { type: Boolean, default: false },
  search: { type: String, default: '' },
  tag: { type: String, default: '' },
  favOnly: { type: Boolean, default: false }
})
const q = computed(() => props.search.trim().toLowerCase())
const matches = (e) =>
  (!q.value || e.name.toLowerCase().includes(q.value) || e.tags.some((t) => t.includes(q.value))) &&
  (!props.tag || e.tags.includes(props.tag))

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
    />

    <div v-show="open" class="section-body">
      <p v-if="!hasOwn" class="empty"><AppIcon name="inbox" /> Empty</p>
      <ul v-if="rows.length" class="rows">
        <SavedDiffRow v-for="entry in rows" :key="entry.id" :entry="entry" />
      </ul>
    </div>
  </section>
</template>

<style scoped src="./styles/SavedDiffsSection.css"></style>
