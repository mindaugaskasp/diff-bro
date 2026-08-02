<script setup>
// Snippets sidebar layout; filtering is useSnippetFilters, previews
// useSnippetPreview, rows SnippetRow.
import { computed, ref, watch } from 'vue'
import { matchesTags } from '../utils/tagFilter'
import { useSnippetStore } from '../stores/snippetStore'
import { useSnippetFilters } from '../composables/useSnippetFilters'
import { useSnippetPreview } from '../composables/useSnippetPreview'
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
const sectionOpen = ref(true)

// Tag filtering + search live in the shell (props); this just mirrors the query.
const { query, visibleFavorites, visibleListed } = useSnippetFilters()
const { preview, onRowEnter, onRowLeave, onCardEnter, onCardLeave, openEditor, openDiagram } =
  useSnippetPreview()

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

// Expand the section and open a blank snippet.
function newSnippet() {
  sectionOpen.value = true
  store.editingSnippet = { id: null }
}
</script>

<template>
  <section class="snippets-section sidebar-section">
    <SectionHeader
      section-id="snippets"
      title="Snippets"
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
          data-tip="New"
          aria-label="New snippet"
          @click.stop="newSnippet"
        >
          <AppIcon name="plus" />
        </button>
        <button
          class="btn btn-icon"
          data-tip="Export"
          aria-label="Export all snippets to a passphrase-protected file"
          @click.stop="store.pendingExport = { all: true }"
        >
          <AppIcon name="arrow-up" />
        </button>
        <button
          class="btn btn-icon"
          data-tip="Import"
          aria-label="Import snippets from a file"
          @click.stop="store.pendingImport = true"
        >
          <AppIcon name="arrow-down" />
        </button>
      </template>
    </SectionHeader>

    <div v-show="sectionOpen" class="section-body">
      <p v-if="!store.entries.length" class="empty"><AppIcon name="inbox" /> Empty</p>

      <ul v-if="store.entries.length" class="rows">
        <li v-if="!rows.length" class="empty small">No snippets match — try removing a filter.</li>
        <SnippetRow
          v-for="entry in rows"
          :key="entry.id"
          :entry="entry"
          :favorite="entry.favorite"
          @hover-title="onRowEnter(entry, $event)"
          @leave-title="onRowLeave"
        />
      </ul>
    </div>
  </section>

  <SnippetPreviewCard
    v-if="preview"
    :preview="preview"
    @mouseenter="onCardEnter"
    @mouseleave="onCardLeave"
    @edit="openEditor"
    @view="openDiagram"
  />
</template>

<style scoped src="./styles/SnippetsPanel.css"></style>
