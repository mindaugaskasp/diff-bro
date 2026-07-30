<script setup>
// The "External diffs" section: diffs shared by others, each signed by its sender.
import { computed, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useDiffStore } from '../stores/diffStore'
import SavedDiffRow from './SavedDiffRow.vue'
import SectionHeader from './SectionHeader.vue'
import { MOD } from '../keys'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  first: { type: Boolean, default: false },
  unified: { type: Boolean, default: false },
  search: { type: String, default: '' },
  tag: { type: String, default: '' },
  favOnly: { type: Boolean, default: false }
})

const vault = useVaultStore()
const diff = useDiffStore()

const open = ref(true)
const q = computed(() => props.search.trim().toLowerCase())
const matches = (e) =>
  (!q.value || e.name.toLowerCase().includes(q.value) || e.tags.some((t) => t.includes(q.value))) &&
  (!props.tag || e.tags.includes(props.tag))
// One list, favorited (starred) shared diffs first — no separate Favorites shelf.
const rows = computed(() =>
  (props.favOnly
    ? vault.importedFavorites
    : [...vault.importedFavorites, ...vault.importedOthers]
  ).filter(matches)
)
const hasImported = computed(() => vault.importedActive.length > 0)

// Expand the section, then run the import flow.
function startImport() {
  open.value = true
  diff.importShared()
}
</script>

<template>
  <section class="sidebar-section">
    <SectionHeader
      section-id="external"
      title="External diffs"
      icon="share"
      :open="open"
      :first="first"
      :unified="unified"
      @toggle="open = !open"
    >
      <template #actions>
        <button
          class="btn btn-icon"
          :title="`Import (${MOD}+I)`"
          aria-label="Import a shared diff"
          @click.stop="startImport"
        >
          <AppIcon name="plus" />
        </button>
      </template>
    </SectionHeader>
    <div v-show="open" class="section-body">
      <p v-if="!hasImported" class="empty"><AppIcon name="inbox" /> Empty</p>

      <ul v-if="rows.length" class="rows">
        <SavedDiffRow v-for="entry in rows" :key="entry.id" :entry="entry" />
      </ul>
    </div>
  </section>
</template>

<style scoped src="./styles/ExternalDiffsSection.css"></style>
