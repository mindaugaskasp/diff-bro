<script setup>
// Snippets sidebar layout; filtering is useSnippetFilters, previews
// useSnippetPreview, rows SnippetRow.
import { computed, ref, watch } from 'vue'
import { matchesTags } from '../utils/tagFilter'
import { useSnippetStore } from '../stores/snippetStore'
import { useSnippetFilters } from '../composables/useSnippetFilters'
import { useSnippetPreview } from '../composables/useSnippetPreview'
import { useNewRowMarker } from '../composables/useNewRowMarker'
import { useDiffStore } from '../stores/diffStore'
import { useUiStore } from '../stores/uiStore'
import { t } from '../i18n'
import SnippetRow from './SnippetRow.vue'
import SnippetPreviewCard from './SnippetPreviewCard.vue'
import SectionHeader from './SectionHeader.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  first: { type: Boolean, default: false },
  unified: { type: Boolean, default: false },
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] },
  favOnly: { type: Boolean, default: false }
})

const store = useSnippetStore()
const ui = useUiStore()
const sectionOpen = ref(true)

// Tag filtering + search live in the shell (props); this just mirrors the query.
const { query, visibleFavorites, visibleListed } = useSnippetFilters()
const snippetPreview = useSnippetPreview()
const { preview, onRowEnter, onRowLeave, onCardEnter, onCardLeave, dismiss } = snippetPreview
const { openEditor, openDiagram } = snippetPreview

watch(
  () => props.search,
  (v) => (query.value = v),
  { immediate: true }
)
const byTag = (list) => list.filter((e) => matchesTags(e.tags, props.tags))
// One list, favorites first; the ★ filter keeps only them.
const rows = computed(() => {
  const favs = byTag(visibleFavorites.value)
  return props.favOnly ? favs : [...favs, ...byTag(visibleListed.value)]
})

// A filter is on when there is a search term or a tag selected — the only time
// a per-section count is worth the space.
const filtering = computed(() => !!props.search.trim() || props.tags.length > 0)

// Reveal and retire the row a create just inserted. Snippets have one section,
// so anything the store marks and this list does not show is filtered out.
useNewRowMarker({
  markedId: () => ui.lastCreatedRowId,
  locate: (id) =>
    rows.value.some((e) => e.id === id)
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
      :count="rows.length"
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
        <button
          class="btn btn-icon"
          :data-tip="$t('snippetsPanel.export')"
          :aria-label="$t('snippetsPanel.exportAllSnippetsToA')"
          @click.stop="store.pendingExport = { all: true }"
        >
          <AppIcon name="arrow-up" />
        </button>
        <button
          class="btn btn-icon"
          :data-tip="$t('snippetsPanel.import')"
          :aria-label="$t('snippetsPanel.importSnippetsFromAFile')"
          @click.stop="store.pendingImport = true"
        >
          <AppIcon name="arrow-down" />
        </button>
      </template>
    </SectionHeader>

    <div v-show="sectionOpen" class="section-body">
      <div v-if="!store.entries.length" class="empty empty-cta">
        <p><AppIcon name="inbox" /> {{ $t('snippetsPanel.empty') }}</p>
        <button class="btn btn-primary btn-sm" @click.stop="newSnippet">
          <AppIcon name="plus" /> {{ $t('snippetsPanel.newSnippetCta') }}
        </button>
      </div>

      <ul v-if="store.entries.length" class="rows">
        <li v-if="!rows.length" class="empty small">
          {{ $t('snippetsPanel.noSnippetsMatchTryRemoving') }}
        </li>
        <SnippetRow
          v-for="entry in rows"
          :key="entry.id"
          :entry="entry"
          :favorite="entry.favorite"
          @hover-title="onRowEnter(entry, $event)"
          @leave-title="onRowLeave"
          @dragging="dismiss"
        />
      </ul>
    </div>

    <!-- Fixed-positioned (escapes the sidebar scroll), so it lives INSIDE the
         single section root — a second root node breaks the parent's v-show. -->
    <SnippetPreviewCard
      v-if="preview"
      :preview="preview"
      @mouseenter="onCardEnter"
      @mouseleave="onCardLeave"
      @edit="openEditor"
      @view="openDiagram"
    />
  </section>
</template>

<style scoped src="./styles/SnippetsPanel.css"></style>
