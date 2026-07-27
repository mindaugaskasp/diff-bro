<script setup>
// One snippet row, shared by the Favorites and All shelves — the two lists
// differ only in the star's state, so the markup lives here once.
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import { ago } from '../utils/relativeTime'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'

defineProps({
  /** @type {import('vue').PropType<import('../types').SnippetEntry>} */
  entry: { type: Object, required: true, validator: shaped('id', 'name', 'tags', 'createdAt') },
  favorite: { type: Boolean, default: false }
})

const store = useSnippetStore()
const diff = useDiffStore()
const { copied, flash } = useCopyFeedback()

// Diagram snippets get a resting diagram marker; a snippet left on Auto-detect
// resolves through the language recorded when it was saved.
const isDiagram = (entry) => languageOf(entry) === 'mermaid'

async function copySnippet(id) {
  const content = await store.load(id)
  if (content != null) {
    await window.api.copyText(content)
    flash()
  }
}
// Decrypt a Mermaid snippet and open it in the resizable diagram viewer.
async function viewDiagram(entry) {
  const code = await store.load(entry.id)
  if (code != null) diff.openMermaid(entry.name, code)
}
</script>

<template>
  <li class="row">
    <Transition name="flash">
      <span v-if="copied" class="copied-flash" aria-live="polite">Copied</span>
    </Transition>
    <button
      class="star"
      :class="{ on: favorite }"
      :title="favorite ? 'Unfavorite' : 'Favorite (pin to top)'"
      @click="store.toggleFavorite(entry.id)"
    >
      <AppIcon :name="favorite ? 'star-filled' : 'star'" />
    </button>
    <button class="entry" @click="store.editingSnippet = { id: entry.id }">
      <AppIcon
        v-if="isDiagram(entry)"
        class="mmd"
        name="diagram"
        title="Mermaid diagram — opens in the diagram viewer"
      />
      <span class="nm">{{ entry.name }}</span>
      <span class="dots">
        <span
          v-for="t in entry.tags"
          :key="t"
          class="dot"
          :style="{ background: store.colorOf(t) }"
        ></span>
        <span v-if="!entry.tags.length" class="dot faint"></span>
      </span>
    </button>
    <span class="when">{{ ago(entry.createdAt) }}</span>
    <span class="rowacts">
      <button
        v-if="isDiagram(entry)"
        class="row-btn"
        title="View diagram"
        @click="viewDiagram(entry)"
      >
        <AppIcon name="diagram" />
      </button>
      <button class="row-btn" title="Copy to clipboard" @click="copySnippet(entry.id)">
        <AppIcon name="copy" />
      </button>
      <button
        class="row-btn delete"
        title="Delete"
        @click="store.requestDelete('snippet', entry.id, entry.name)"
      >
        <AppIcon name="trash" />
      </button>
    </span>
  </li>
</template>

<style scoped src="./styles/SnippetRow.css"></style>
