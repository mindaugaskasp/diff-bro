<script setup>
// Snippets sidebar layout; filtering is useSnippetFilters, previews
// useSnippetPreview, rows SnippetRow.
import { computed, ref, watch } from 'vue'
import { matchesTags } from '../utils/tagFilter'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { useSnippetFilters } from '../composables/useSnippetFilters'
import { useSnippetPreview } from '../composables/useSnippetPreview'
import { useNewRowMarker } from '../composables/useNewRowMarker'
import { provideRowReorder } from '../composables/useRowReorder'
import { useDiffStore } from '../stores/diffStore'
import { useUiStore } from '../stores/uiStore'
import { t } from '../i18n'
import SnippetRow from './SnippetRow.vue'
import SnippetPreviewCard from './SnippetPreviewCard.vue'
import SectionHeader from './SectionHeader.vue'
import AppIcon from './AppIcon.vue'
import SnippetsMoreMenu from './SnippetsMoreMenu.vue'
import TagTree from './TagTree.vue'
import { ProposalsGroup } from '../features/claude'

const props = defineProps({
  first: { type: Boolean, default: false },
  unified: { type: Boolean, default: false },
  panel: { type: Boolean, default: false },
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] }
})

defineEmits(['manageTag'])
const store = useSnippetStore()
const ui = useUiStore()
const sectionOpen = ref(true)

// Tag filtering + search live in the shell (props); this just mirrors the query.
const { query, visibleFavorites, visibleListed } = useSnippetFilters()
const snippetPreview = useSnippetPreview()
const { preview, onRowEnter, onRowLeave, onCardEnter, onCardLeave, dismiss } = snippetPreview
const { openEditor, openDiagram, copyPreview, copied } = snippetPreview

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
// The automatic format tag stays findable but makes no section of its own.
const ownTags = (entry) => entry.tags.filter((t) => t !== languageOf(entry))

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
    ),
  open: () => (sectionOpen.value = true)
})

// Expand the section and open a blank snippet.
function newSnippet() {
  sectionOpen.value = true
  store.editingSnippet = { id: null }
}
</script>

<template>
  <section class="snippets-section sidebar-section" data-tour="snippets">
    <SectionHeader
      section-id="snippets"
      :title="$t('snippetsPanel.snippets')"
      icon="code"
      :open="sectionOpen"
      :first="first"
      :unified="unified"
      :panel="panel"
      :count="items.length"
      :filtering="filtering"
      @toggle="sectionOpen = !sectionOpen"
    >
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

    <div v-show="sectionOpen || panel" class="section-body">
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
            @hover-title="onRowEnter(item, $event)"
            @leave-title="onRowLeave"
            @dragging="dismiss"
          />
        </template>
      </TagTree>
    </div>

    <!-- Fixed-positioned (escapes the sidebar scroll), so it lives INSIDE the
         single section root — a second root node breaks the parent's v-show. -->
    <SnippetPreviewCard
      v-if="preview"
      :preview="preview"
      :copied="!!copied"
      @mouseenter="onCardEnter"
      @mouseleave="onCardLeave"
      @edit="openEditor"
      @view="openDiagram"
      @copy="copyPreview"
    />
  </section>
</template>

<style scoped src="./styles/SnippetsPanel.css"></style>
