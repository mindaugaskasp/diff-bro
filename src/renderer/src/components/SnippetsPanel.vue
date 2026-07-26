<script setup>
// Snippets sidebar: a filter bar over two shelves (★ favorites, then the rest).
// Filtering lives in useSnippetFilters, hover previews in useSnippetPreview, and
// a row's own markup in SnippetRow — this file is layout and nothing else.
import { computed, ref, watch } from 'vue'
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
  tag: { type: String, default: '' },
  favOnly: { type: Boolean, default: false }
})

const store = useSnippetStore()
const sectionOpen = ref(true)

// Tag filtering + search live in the shell (props); this just mirrors the query.
const { query, visibleFavorites, visibleListed } = useSnippetFilters()
const { preview, onRowEnter, onRowLeave } = useSnippetPreview()

watch(() => props.search, (v) => (query.value = v), { immediate: true })
const byTag = (list) => (props.tag ? list.filter((e) => e.tags.includes(props.tag)) : list)
// One list, favorites (starred) first — no separate Favorites shelf. The ★
// filter keeps only them.
const rows = computed(() => {
  const favs = byTag(visibleFavorites.value)
  return props.favOnly ? favs : [...favs, ...byTag(visibleListed.value)]
})

// The "+" lives in the header; expand the section (its editor mounts in the
// body) and open a blank snippet.
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
      @toggle="sectionOpen = !sectionOpen"
    >
      <template #actions>
        <button class="btn btn-icon" title="New snippet" @click.stop="newSnippet">
          <AppIcon name="plus" />
        </button>
        <button
          class="btn btn-icon"
          title="Export all snippets to a passphrase-protected file"
          @click.stop="store.pendingExport = { all: true }"
        >
          <AppIcon name="arrow-up" />
        </button>
        <button
          class="btn btn-icon"
          title="Import snippets from a file"
          @click.stop="store.pendingImport = true"
        >
          <AppIcon name="arrow-down" />
        </button>
      </template>
    </SectionHeader>

    <div v-show="sectionOpen" class="section-body">
      <p v-if="!store.entries.length" class="empty">
        Use the <strong>+</strong> in this section's header to create one — saved encrypted, tagged
        however you like, and exportable as a passphrase-protected file.
      </p>

      <!-- One list, favorites first (marked by the gold star) — no sub-headers. -->
      <ul v-if="store.entries.length" class="rows">
        <li v-if="!rows.length" class="empty small">No snippets match — try removing a filter.</li>
        <SnippetRow
          v-for="entry in rows"
          :key="entry.id"
          :entry="entry"
          :favorite="entry.favorite"
          @mouseenter="onRowEnter(entry, $event)"
          @mouseleave="onRowLeave"
        />
      </ul>
    </div>
  </section>

  <SnippetPreviewCard v-if="preview" :preview="preview" />
</template>

<style scoped src="./styles/SnippetsPanel.css"></style>
