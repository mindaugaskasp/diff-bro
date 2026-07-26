<script setup>
// Snippets sidebar: a filter bar over two shelves (★ favorites, then the rest).
// Filtering lives in useSnippetFilters, hover previews in useSnippetPreview, and
// a row's own markup in SnippetRow — this file is layout and nothing else.
import { nextTick, ref, watch } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useSnippetFilters } from '../composables/useSnippetFilters'
import { useSnippetPreview } from '../composables/useSnippetPreview'
import SnippetRow from './SnippetRow.vue'
import SnippetTagBar from './SnippetTagBar.vue'
import SnippetPreviewCard from './SnippetPreviewCard.vue'
import SectionHeader from './SectionHeader.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  first: { type: Boolean, default: false },
  unified: { type: Boolean, default: false },
  search: { type: String, default: '' }
})

const store = useSnippetStore()

// Collapse state: the whole section, then each shelf.
const sectionOpen = ref(true)
const favOpen = ref(true)
const allOpen = ref(true)

const {
  query,
  activeTags,
  filtering,
  toggleTag,
  clearFilters,
  visibleFavorites,
  visibleListed,
  anyVisible,
  tagChips
} = useSnippetFilters()

const { preview, onRowEnter, onRowLeave } = useSnippetPreview()

// In the unified sidebar the shell owns the search — mirror its query into the
// snippet filter so typing there narrows the snippets too.
watch(
  () => props.search,
  (v) => {
    if (props.unified) query.value = v
  },
  { immediate: true }
)

// The search box is hidden until the magnifier by the "All snippets" header is
// pressed — so the resting section stays uncluttered. Toggling it open focuses
// the field and expands the list; toggling closed clears the filter.
const searchOpen = ref(false)
const searchInput = ref(null)
async function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) {
    allOpen.value = true
    await nextTick()
    searchInput.value?.focus()
  } else {
    query.value = ''
  }
}

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

      <!-- ★ Favorites shelf -->
      <div v-if="visibleFavorites.length" class="shelf fav" :class="{ collapsed: !favOpen }">
        <button class="shelf-head" @click="favOpen = !favOpen">
          <AppIcon class="chev" :class="{ open: favOpen }" name="chevron-right" />
          <span class="shelf-title"><AppIcon name="star-filled" /> Favorites</span>
          <span class="shelf-count">{{ visibleFavorites.length }}</span>
        </button>
        <ul v-show="favOpen" class="rows">
          <SnippetRow
            v-for="entry in visibleFavorites"
            :key="entry.id"
            :entry="entry"
            favorite
            @mouseenter="onRowEnter(entry, $event)"
            @mouseleave="onRowLeave"
          />
        </ul>
      </div>

      <!-- All snippets shelf (newest first) -->
      <div v-if="store.entries.length" class="shelf" :class="{ collapsed: !allOpen }">
        <div class="shelf-head-row">
          <button class="shelf-head" @click="allOpen = !allOpen">
            <AppIcon class="chev" :class="{ open: allOpen }" name="chevron-right" />
            <span class="shelf-title"
              >All snippets <span class="sort-note">· newest first</span></span
            >
            <span class="shelf-count">{{ visibleListed.length }}</span>
          </button>
          <button
            v-if="!unified"
            class="shelf-search"
            :class="{ on: searchOpen }"
            title="Search snippets"
            @click="toggleSearch"
          >
            <AppIcon name="search" />
          </button>
        </div>
        <div
          v-if="searchOpen && !unified"
          class="filter sidebar-field"
          :class="{ 'has-text': query.trim() }"
        >
          <AppIcon class="search-glyph" name="search" />
          <input
            ref="searchInput"
            v-model="query"
            type="search"
            placeholder="Filter by name or tag…"
            spellcheck="false"
            @keyup.escape="toggleSearch"
          />
          <button v-if="query.trim()" class="xbox" title="Clear search" @click="query = ''">
            <AppIcon name="x" />
          </button>
        </div>
        <ul v-show="allOpen" class="rows">
          <li v-if="!anyVisible" class="empty small">No snippets match — try removing a filter.</li>
          <SnippetRow
            v-for="entry in visibleListed"
            :key="entry.id"
            :entry="entry"
            @mouseenter="onRowEnter(entry, $event)"
            @mouseleave="onRowLeave"
          />
        </ul>
      </div>

      <!-- Tag filter at the FOOT of the section; wrapper owns the spacing/divider. -->
      <div v-if="store.entries.length" class="tags-footer">
        <SnippetTagBar
          :chips="tagChips"
          :active="activeTags"
          :filtering="filtering"
          @toggle="toggleTag"
          @clear="clearFilters"
        />
      </div>
    </div>
  </section>

  <SnippetPreviewCard v-if="preview" :preview="preview" />
</template>

<style scoped src="./styles/SnippetsPanel.css"></style>
