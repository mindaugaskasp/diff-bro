<script setup>
// The "Saved diffs" group: your own encrypted, auto-expiring (or kept) diffs.
import { computed, ref } from 'vue'
import { useDiffRows, OWN_GROUPS } from '../composables/useDiffRows'
import { useVaultStore } from '../stores/vaultStore'
import SavedDiffRow from './SavedDiffRow.vue'
import TagTree from './TagTree.vue'
import { useSnippetStore } from '../stores/snippetStore'
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
  panel: { type: Boolean, default: false },
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] }
})

defineEmits(['manageTag'])
const tabs = useTabsStore()
const vault = useVaultStore()
const snippets = useSnippetStore()
const { rows, items, filtering } = useDiffRows(() => props, OWN_GROUPS)
const ui = useUiStore()
const open = ref(true)

// The section in the group key confines a drag to it; the store group is the order.
const storeGroup = (entry) => OWN_GROUPS[entry.favorite ? 0 : 1]
const groupOf = (entry, section) => `${storeGroup(entry)}|${section}`
const indexOf = (entry) => vault[storeGroup(entry)].indexOf(entry)
const reorder = provideRowReorder((group, from, to) =>
  ui.markMovedRow(vault.reorder(group.split('|')[0], from, to))
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
      :panel="panel"
      :count="rows.length"
      :filtering="filtering"
      @toggle="open = !open"
    >
      <template v-if="$slots.title" #title><slot name="title" /></template>
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

    <div v-show="open || panel" class="section-body">
      <slot name="lead" />
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
      <!-- Filtered to nothing has to say so; a blank box reads as broken. -->
      <p v-else-if="!items.length" class="empty small">
        {{ $t('savedDiffsSection.noSavedDiffsMatchTry') }}
      </p>
      <TagTree
        v-else
        :items="items"
        list="diffs"
        :searching="filtering"
        :scope="tags[0] ?? ''"
        :color-of="snippets.colorOf"
        :class="{ reordering: reorder.isReordering.value }"
        @manage="$emit('manageTag', $event)"
      >
        <template #row="{ item, section }">
          <SavedDiffRow :entry="item" :group="groupOf(item, section)" :index="indexOf(item)" />
        </template>
      </TagTree>
    </div>
  </section>
</template>

<style scoped src="./styles/SavedDiffsSection.css"></style>
