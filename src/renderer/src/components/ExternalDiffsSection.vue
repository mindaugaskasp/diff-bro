<script setup>
// The "External diffs" section: diffs shared by others, each signed by its sender.
import { computed, ref } from 'vue'
import { useDiffRows, RECEIVED_GROUPS } from '../composables/useDiffRows'
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
  panel: { type: Boolean, default: false },
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] },
  favOnly: { type: Boolean, default: false }
})

const vault = useVaultStore()
const { rows, filtering } = useDiffRows(() => props, RECEIVED_GROUPS)
const ui = useUiStore()
const share = useShareStore()

const open = ref(true)
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
      :panel="panel"
      :count="rows.length"
      :filtering="filtering"
      @toggle="open = !open"
    >
      <template v-if="$slots.title" #title><slot name="title" /></template>
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
    <div v-show="open || panel" class="section-body">
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
