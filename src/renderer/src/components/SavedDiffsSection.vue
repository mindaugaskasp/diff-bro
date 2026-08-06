<script setup>
// The "Saved diffs" group: your own encrypted, auto-expiring (or kept) diffs.
import { computed, ref } from 'vue'
import { matchesTags } from '../utils/tagFilter'
import { useVaultStore } from '../stores/vaultStore'
import SavedDiffRow from './SavedDiffRow.vue'
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

// One list, favorites first; the ★ filter keeps only them.
const rows = computed(() =>
  (props.favOnly ? vault.favoritesOwn : [...vault.favoritesOwn, ...vault.ownActive]).filter(matches)
)
const hasOwn = computed(() => vault.active.some((e) => !e.from))

// This section owns a marked diff only if it is one of yours; an imported one
// belongs to ExternalDiffsSection, which arms its own timer for it.
useNewRowMarker({
  markedId: () => ui.lastCreatedRowId,
  locate: (id) => {
    if (rows.value.some((e) => e.id === id)) return 'visible'
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
              ? 'New comparison, ready for pasted text'
              : `${tabsFullNotice(tabs.tabs)} — close one first`
          "
          :aria-label="$t('savedDiffsSection.newComparisonFromPastedText')"
          @click.stop="tabs.newTab({ paste: true })"
        >
          <AppIcon name="plus" />
        </button>
      </template>
    </SectionHeader>

    <div v-show="open" class="section-body">
      <p v-if="!hasOwn" class="empty">
        <AppIcon name="inbox" /> {{ $t('savedDiffsSection.empty') }}
      </p>
      <ul v-else class="rows">
        <!-- Filtered to nothing has to say so; a blank box reads as broken. -->
        <li v-if="!rows.length" class="empty small">
          {{ $t('savedDiffsSection.noSavedDiffsMatchTry') }}
        </li>
        <SavedDiffRow v-for="entry in rows" :key="entry.id" :entry="entry" />
      </ul>
    </div>
  </section>
</template>

<style scoped src="./styles/SavedDiffsSection.css"></style>
