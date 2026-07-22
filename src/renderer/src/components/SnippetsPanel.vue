<script setup>
// Snippets sidebar: a filter bar over two shelves (★ favorites, then the rest).
// Filtering lives in useSnippetFilters, hover previews in useSnippetPreview, and
// a row's own markup in SnippetRow — this file is layout and nothing else.
import { ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { useSnippetFilters } from '../composables/useSnippetFilters'
import { useSnippetPreview } from '../composables/useSnippetPreview'
import SnippetRow from './SnippetRow.vue'
import SnippetTagBar from './SnippetTagBar.vue'
import SnippetPreviewCard from './SnippetPreviewCard.vue'
import SectionHeader from './SectionHeader.vue'
import AppIcon from './AppIcon.vue'

defineProps({ first: { type: Boolean, default: false } })

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
</script>

<template>
  <section class="snippets-section sidebar-section">
    <SectionHeader
      section-id="snippets"
      title="Snippets"
      :open="sectionOpen"
      :first="first"
      @toggle="sectionOpen = !sectionOpen"
    >
      <template #actions>
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
      <div class="section-actions">
        <button
          class="btn btn-sm btn-block btn-primary"
          title="Create a new snippet"
          @click="store.editingSnippet = { id: null }"
        >
          + New snippet
        </button>
      </div>

      <div v-if="store.entries.length" class="filter" :class="{ 'has-text': query.trim() }">
        <input
          v-model="query"
          type="search"
          placeholder="Filter by name or tag…"
          spellcheck="false"
        />
        <button v-if="query.trim()" class="xbox" title="Clear search" @click="query = ''">
          <AppIcon name="x" />
        </button>
      </div>

      <p v-if="!store.entries.length" class="empty">
        Press <strong>New snippet</strong> to create one — saved encrypted, tagged however you like,
        and exportable as a passphrase-protected file.
      </p>

      <SnippetTagBar
        v-if="store.entries.length"
        :chips="tagChips"
        :active="activeTags"
        :filtering="filtering"
        @toggle="toggleTag"
        @clear="clearFilters"
      />

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
        <button class="shelf-head" @click="allOpen = !allOpen">
          <AppIcon class="chev" :class="{ open: allOpen }" name="chevron-right" />
          <span class="shelf-title"
            >All snippets <span class="sort-note">· newest first</span></span
          >
          <span class="shelf-count">{{ visibleListed.length }}</span>
        </button>
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
    </div>
  </section>

  <SnippetPreviewCard v-if="preview" :preview="preview" />
</template>

<style scoped src="./styles/SnippetsPanel.css"></style>
