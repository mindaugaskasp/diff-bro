<script setup>
// The "External diffs" section: diffs shared by others, each signed by its sender.
import { computed, ref } from 'vue'
import { matchesTags } from '../utils/tagFilter'
import { useVaultStore } from '../stores/vaultStore'
import SavedDiffRow from './SavedDiffRow.vue'
import { provideRowReorder } from '../composables/useRowReorder'
import SectionHeader from './SectionHeader.vue'
import { MOD } from '../keys'
import AppIcon from './AppIcon.vue'
import { useShareStore } from '../features/share'
import { useNewRowMarker } from '../composables/useNewRowMarker'
import { useDiffStore } from '../stores/diffStore'
import { useUiStore } from '../stores/uiStore'
import { t } from '../i18n'

const props = defineProps({
  first: { type: Boolean, default: false },
  unified: { type: Boolean, default: false },
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] },
  favOnly: { type: Boolean, default: false }
})

const vault = useVaultStore()
const ui = useUiStore()
const share = useShareStore()

const open = ref(true)
const q = computed(() => props.search.trim().toLowerCase())
// A filter is on when there is a search term or a tag selected — the only time
// a per-section count is worth the space.
const filtering = computed(() => !!q.value || props.tags.length > 0)
const matches = (e) =>
  (!q.value || e.name.toLowerCase().includes(q.value) || e.tags.some((t) => t.includes(q.value))) &&
  matchesTags(e.tags, props.tags)
// A row carries its place in the FULL group, not in the filtered view: dropping
// A in front of B has to mean the same thing whether or not a filter is hiding
// the rows between them.
const placed = (group) =>
  vault[group]
    .filter(matches)
    .map((entry) => ({ entry, group, index: vault[group].indexOf(entry) }))
// One list, favorited (starred) shared diffs first — no separate Favorites shelf.
const rows = computed(() =>
  props.favOnly
    ? placed('importedFavorites')
    : [...placed('importedFavorites'), ...placed('importedOthers')]
)

const reorder = provideRowReorder((group, from, to) =>
  ui.markMovedRow(vault.reorder(group, from, to))
)
const hasImported = computed(() => vault.importedActive.length > 0)

// The mirror of SavedDiffsSection: this one owns a marked diff only when it
// came from someone else, so the two never both retire the same mark.
useNewRowMarker({
  markedId: () => ui.lastCreatedRowId,
  locate: (id) => {
    if (rows.value.some((r) => r.entry.id === id)) return 'visible'
    return vault.importedActive.some((e) => e.id === id) ? 'filtered' : 'elsewhere'
  },
  retire: () => ui.clearNewRow(ui.lastCreatedRowId),
  onHidden: (id) =>
    useDiffStore().showNotice(
      t('newRow.hiddenByFilter', {
        name: vault.importedActive.find((e) => e.id === id)?.name ?? ''
      })
    ),
  open: () => (open.value = true)
})

// Expand the section, then run the import flow.
function startImport() {
  open.value = true
  share.importShared()
}
</script>

<template>
  <section class="sidebar-section">
    <SectionHeader
      section-id="external"
      :title="$t('externalDiffsSection.externalDiffs')"
      icon="share"
      :open="open"
      :first="first"
      :unified="unified"
      :count="rows.length"
      :filtering="filtering"
      @toggle="open = !open"
    >
      <template #actions>
        <button
          class="btn btn-icon"
          :data-tip="$t('externalDiffsSection.importTip', { mod: MOD })"
          :aria-label="$t('externalDiffsSection.importASharedDiff')"
          @click.stop="startImport"
        >
          <AppIcon name="plus" />
        </button>
      </template>
    </SectionHeader>
    <div v-show="open" class="section-body">
      <p v-if="!hasImported" class="empty">
        <AppIcon name="inbox" /> {{ $t('externalDiffsSection.empty') }}
      </p>

      <ul v-else class="rows" :class="{ reordering: reorder.isReordering.value }">
        <!-- Filtered to nothing has to say so; a blank box reads as broken. -->
        <li v-if="!rows.length" class="empty small">
          {{ $t('externalDiffsSection.noSharedDiffsMatchTry') }}
        </li>
        <SavedDiffRow
          v-for="row in rows"
          :key="row.entry.id"
          :entry="row.entry"
          :group="row.group"
          :index="row.index"
        />
      </ul>
    </div>
  </section>
</template>

<style scoped src="./styles/ExternalDiffsSection.css"></style>
