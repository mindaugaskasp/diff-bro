<script setup>
// One snippet row (shared by both shelves; only the star state differs). Leads
// with a language monogram so the row is recognizable before the name is read.
import { computed } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { useDiffStore } from '../stores/diffStore'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import { languageMonogram } from '../utils/languageMonogram'
import { firstClaudeUrl } from '../utils/detectLanguage'
import { parseTemplateVars } from '../utils/templateVars'
import { ago } from '../utils/relativeTime'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').SnippetEntry>} */
  entry: { type: Object, required: true, validator: shaped('id', 'name', 'tags', 'createdAt') },
  favorite: { type: Boolean, default: false }
})

const store = useSnippetStore()
const diff = useDiffStore()
const { copied, flash } = useCopyFeedback()

const lang = computed(() => languageOf(props.entry))
const mono = computed(() => languageMonogram(lang.value))
const isDiagram = computed(() => lang.value === 'mermaid')
const isClaude = computed(() => lang.value === 'claude')
// Drop the tag that just restates the monogram (the auto format tag), so the
// tag word carries information the type anchor doesn't already.
const shownTags = computed(() => props.entry.tags.filter((t) => t !== lang.value))

async function copySnippet(id) {
  const content = await store.load(id)
  if (content == null) return
  // A Claude prompt with placeholders routes through the fill dialog first.
  if (isClaude.value && parseTemplateVars(content).length) {
    store.pendingFill = { name: props.entry.name, content }
    return
  }
  await window.api.copyText(content)
  flash()
}
async function viewDiagram(entry) {
  const code = await store.load(entry.id)
  if (code != null) diff.openMermaid(entry.name, code)
}
// Opening is gated by the main-process claude.ai allowlist; this only offers a
// candidate URL from the snippet.
async function openLink() {
  const content = await store.load(props.entry.id)
  const url = content != null ? firstClaudeUrl(content) : null
  if (url) await window.api.openClaudeLink(url)
  else diff.showNotice('No Claude link in this snippet.')
}

// Hovering the name previews the snippet — not the whole row, which made the
// card appear while you were only reaching for the row's buttons.
defineEmits(['hoverTitle', 'leaveTitle'])
</script>

<template>
  <li class="row" data-preview-anchor>
    <Transition name="flash">
      <span v-if="copied" class="copied-flash" aria-live="polite">Copied</span>
    </Transition>
    <button
      class="star"
      :class="{ on: favorite }"
      :data-tip="favorite ? 'Unfavorite' : 'Favorite'"
      :aria-label="favorite ? 'Unfavorite' : 'Favorite (pin to top)'"
      @click="store.toggleFavorite(entry.id)"
    >
      <AppIcon :name="favorite ? 'star-filled' : 'star'" />
    </button>
    <button class="entry" @click="store.editingSnippet = { id: entry.id }">
      <span class="monogram" :style="{ '--fam': mono.family }" :title="lang">{{ mono.label }}</span>
      <span
        class="nm"
        @mouseenter="$emit('hoverTitle', $event)"
        @mouseleave="$emit('leaveTitle')"
        >{{ entry.name }}</span
      >
      <span
        v-if="entry.vars?.length"
        class="varchip"
        :title="`${entry.vars.length} variable${entry.vars.length > 1 ? 's' : ''} to fill on copy: ${entry.vars.join(', ')}`"
      >
        <AppIcon name="braces" />{{ entry.vars.length }}
      </span>
      <span v-if="shownTags.length" class="tag-word">
        <span class="tw-dot" :style="{ background: store.colorOf(shownTags[0]) }"></span>
        <span class="tw-label">{{ shownTags[0] }}</span>
        <span v-if="shownTags.length > 1" class="tw-more">+{{ shownTags.length - 1 }}</span>
      </span>
    </button>
    <span class="when">{{ ago(entry.createdAt) }}</span>
    <span class="rowacts">
      <button
        v-if="isDiagram"
        class="row-btn"
        data-tip="Diagram"
        aria-label="View diagram"
        @click="viewDiagram(entry)"
      >
        <AppIcon name="diagram" />
      </button>
      <button
        v-if="isClaude"
        class="row-btn"
        data-tip="Open"
        aria-label="Open Claude link"
        @click="openLink"
      >
        <AppIcon name="link" />
      </button>
      <button
        class="row-btn"
        data-tip="Copy"
        aria-label="Copy to clipboard"
        @click="copySnippet(entry.id)"
      >
        <AppIcon name="copy" />
      </button>
      <button
        class="row-btn delete"
        data-tip="Delete"
        aria-label="Delete"
        @click="store.requestDelete('snippet', entry.id, entry.name)"
      >
        <AppIcon name="trash" />
      </button>
    </span>
  </li>
</template>

<style scoped src="./styles/SnippetRow.css"></style>
