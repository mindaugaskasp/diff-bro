<script setup>
// The "Saved diffs" group: your own encrypted, auto-expiring (or kept) diffs.
import { computed, ref } from 'vue'
import { matchesTags } from '../utils/tagFilter'
import { useVaultStore } from '../stores/vaultStore'
import SavedDiffRow from './SavedDiffRow.vue'
import { provideRowReorder } from '../composables/useRowReorder'
import SectionHeader from './SectionHeader.vue'
import { useTabsStore } from '../stores/tabsStore'
import AppIcon from './AppIcon.vue'
import { tabsFullNotice } from '../utils/tabNotices'
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
const q = computed(() => props.search.trim().toLowerCase())
const matches = (e) =>
  (!q.value || e.name.toLowerCase().includes(q.value) || e.tags.some((t) => t.includes(q.value))) &&
  matchesTags(e.tags, props.tags)

// A filter is on when there is a search term or a tag selected — the only time
// a per-section count is worth the space.
const filtering = computed(() => !!q.value || props.tags.length > 0)

const tabs = useTabsStore()
const vault = useVaultStore()
const ui = useUiStore()
const open = ref(true)

// A row carries its place in the FULL group, not in the filtered view: dropping
// A in front of B has to mean the same thing whether or not a filter is hiding
// the rows between them.
const placed = (group) =>
  vault[group]
    .filter(matches)
    .map((entry) => ({ entry, group, index: vault[group].indexOf(entry) }))
// One list, favorites first; the ★ filter keeps only them.
const rows = computed(() =>
  props.favOnly ? placed('favoritesOwn') : [...placed('favoritesOwn'), ...placed('ownActive')]
)

const reorder = provideRowReorder((group, from, to) =>
  ui.markMovedRow(vault.reorder(group, from, to))
)
const hasOwn = computed(() => vault.active.some((e) => !e.from))

// This section owns a marked diff only if it is one of yours; an imported one
// belongs to ExternalDiffsSection, which arms its own timer for it.
useNewRowMarker({
  markedId: () => ui.lastCreatedRowId,
  locate: (id) => {
    if (rows.value.some((r) => r.entry.id === id)) return 'visible'
    return vault.active.some((e) => e.id === id && !e.from) ? 'filtered' : 'elsewhere'
  },
  retire: () => ui.clearNewRow(ui.lastCreatedRowId),
  onHidden: (id) =>
    useDiffStore().showNotice(
      t('newRow.hiddenByFilter', { name: vault.active.find((e) => e.id === id)?.name ?? '' })
    ),
  open: () => (open.value = true)
})
</script>

<template>
  <section class="sidebar-section">
    <SectionHeader
      section-id="saved"
      :title="$t('savedDiffsSection.savedDiffs')"
      icon="folder"
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
          :disabled="!tabs.canAdd"
          :data-tip="
            tabs.canAdd
              ? $t('savedDiffsSection.newComparisonTip')
              : $t('savedDiffsSection.closeOneFirst', { reason: tabsFullNotice(tabs.tabs) })
          "
          :aria-label="$t('savedDiffsSection.newComparisonFromPastedText')"
          @click.stop="tabs.newTab({ paste: true })"
        >
          <AppIcon name="plus" />
        </button>
      </template>
    </SectionHeader>

    <div v-show="open" class="section-body">
      <div v-if="!hasOwn" class="empty empty-cta">
        <p><AppIcon name="inbox" /> {{ $t('savedDiffsSection.empty') }}</p>
        <button
          class="btn btn-primary btn-sm"
          :disabled="!tabs.canAdd"
          @click.stop="tabs.newTab({ paste: true })"
        >
          <AppIcon name="plus" /> {{ $t('savedDiffsSection.newComparisonCta') }}
        </button>
      </div>
      <ul v-else class="rows" :class="{ reordering: reorder.isReordering.value }">
        <!-- Filtered to nothing has to say so; a blank box reads as broken. -->
        <li v-if="!rows.length" class="empty small">
          {{ $t('savedDiffsSection.noSavedDiffsMatchTry') }}
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

<style scoped src="./styles/SavedDiffsSection.css"></style>
