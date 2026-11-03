<script setup>
// Snippets sidebar layout; filtering is useSnippetFilters, rows SnippetRow.
import { computed, watch } from 'vue'
import { matchesTags } from '../utils/tagFilter'
import { useSnippetStore } from '../stores/snippetStore'
import { ownTags } from '../utils/snippetState'
import { useSnippetFilters } from '../composables/useSnippetFilters'
import { useNewRowMarker } from '../composables/useNewRowMarker'
import { provideRowReorder } from '../composables/useRowReorder'
import { useDiffStore } from '../stores/diffStore'
import { useUiStore } from '../stores/uiStore'
import { t } from '../i18n'
import SnippetRow from './SnippetRow.vue'
import SectionHeader from './SectionHeader.vue'
import AppIcon from './AppIcon.vue'
import SnippetsMoreMenu from './SnippetsMoreMenu.vue'
import TagTree from './TagTree.vue'
import { ProposalsGroup } from '../features/claude'

const props = defineProps({
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] }
})

defineEmits(['manageTag'])
const store = useSnippetStore()
const ui = useUiStore()

// Tag filtering + search live in the shell (props); this just mirrors the query.
const { query, visibleFavorites, visibleListed } = useSnippetFilters()

watch(
  () => props.search,
  (v) => (query.value = v),
  { immediate: true }
)
const byTag = (list) => list.filter((e) => matchesTags(e.tags, props.tags))
// Favorites first; TagTree sorts them into sections.
const items = computed(() => [...byTag(visibleFavorites.value), ...byTag(visibleListed.value)])
// A row's place is in the FULL store group, so a drop means the same thing
// whatever a filter hides; the section in the group key confines the drag to it.
const storeGroup = (entry) => (entry.favorite ? 'favorites' : 'listed')
const groupOf = (entry, section) => `${storeGroup(entry)}|${section}`
const indexOf = (entry) => store[storeGroup(entry)].indexOf(entry)

const reorder = provideRowReorder((group, from, to) =>
  ui.markMovedRow(store.reorder(group.split('|')[0], from, to))
)

// A filter is on when there is a search term or a tag selected — the only time
// a per-section count is worth the space.
const filtering = computed(() => !!props.search.trim() || props.tags.length > 0)

// Reveal and retire the row a create just inserted. Snippets have one section,
// so anything the store marks and this list does not show is filtered out.
useNewRowMarker({
  markedId: () => ui.lastCreatedRowId,
  locate: (id) =>
    items.value.some((e) => e.id === id)
      ? 'visible'
      : store.entries.some((e) => e.id === id)
        ? 'filtered'
        : 'elsewhere',
  retire: () => ui.clearNewRow(ui.lastCreatedRowId),
  onHidden: (id) =>
    useDiffStore().showNotice(
      t('newRow.hiddenByFilter', { name: store.entries.find((e) => e.id === id)?.name ?? '' })
    )
})

// Expand the section and open a blank snippet.
function newSnippet() {
  store.editingSnippet = { id: null }
}
</script>

<template>
  <section class="snippets-section sidebar-section" data-tour="snippets">
    <SectionHeader :title="$t('snippetsPanel.snippets')" :count="items.length">
      <template #actions>
        <button
          class="btn btn-icon"
          :data-tip="$t('snippetsPanel.new')"
          :aria-label="$t('snippetsPanel.newSnippet')"
          data-tour="snippet-new"
          @click.stop="newSnippet"
        >
          <AppIcon name="plus" />
        </button>
        <span class="more-wrap" @click.stop><SnippetsMoreMenu /></span>
      </template>
    </SectionHeader>

    <div class="section-body">
      <ProposalsGroup kind="snippet" />
      <div v-if="!store.entries.length" class="empty empty-cta">
        <p><AppIcon name="inbox" /> {{ $t('snippetsPanel.empty') }}</p>
        <button class="btn btn-primary btn-sm" @click.stop="newSnippet">
          <AppIcon name="plus" /> {{ $t('snippetsPanel.newSnippetCta') }}
        </button>
      </div>

      <p v-if="store.entries.length && !items.length" class="empty small">
        {{ $t('snippetsPanel.noSnippetsMatchTryRemoving') }}
      </p>
      <TagTree
        v-if="items.length"
        :items="items"
        list="snippets"
        :searching="filtering"
        :scope="tags[0] ?? ''"
        :color-of="store.colorOf"
        :tags-of="ownTags"
        :class="{ reordering: reorder.isReordering.value }"
        @manage="$emit('manageTag', $event)"
      >
        <template #row="{ item, section }">
          <SnippetRow
            :entry="item"
            :favorite="item.favorite"
            :group="groupOf(item, section)"
            :index="indexOf(item)"
          />
        </template>
      </TagTree>
    </div>
  </section>
</template>

<style scoped src="./styles/SnippetsPanel.css"></style>
