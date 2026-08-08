<script setup>
// One snippet row (shared by both shelves; only the star state differs). Leads
// with a language monogram so the row is recognizable before the name is read.
import { computed } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { useImageExportStore } from '../features/imageExport'
import { useDiffStore } from '../stores/diffStore'
import { useCopyFeedback } from '../composables/useCopyFeedback'
import { languageMonogram } from '../utils/languageMonogram'
import { firstClaudeUrl } from '../utils/detectLanguage'
import { parseTemplateVars } from '../utils/templateVars'
import { ago } from '../utils/relativeTime'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'
import { SECRET_NOTICE, isSecret } from '../utils/secretSnippet'
import { useSnippetDrag } from '../composables/useSnippetDrag'
import { injectRowReorder } from '../composables/useRowReorder'
import { useUiStore } from '../stores/uiStore'
import { t } from '../i18n'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').SnippetEntry>} */
  entry: { type: Object, required: true, validator: shaped('id', 'name', 'tags', 'createdAt') },
  favorite: { type: Boolean, default: false },
  /** Which reorderable list this row is in, and where in the FULL group. */
  group: { type: String, default: '' },
  index: { type: Number, default: -1 }
})

const store = useSnippetStore()

const ui = useUiStore()
const imageExport = useImageExportStore()
const diff = useDiffStore()
const { copied, flash } = useCopyFeedback()
const { startDrag } = useSnippetDrag()
const reorder = injectRowReorder()
const rowState = computed(() => ({
  favorite: props.favorite,
  'is-new': isNew.value,
  'is-moved': ui.lastMovedRowId === props.entry.id
}))

const isNew = computed(() => ui.lastCreatedRowId === props.entry.id)
const lang = computed(() => languageOf(props.entry))
const mono = computed(() => languageMonogram(lang.value))
const isDiagram = computed(() => lang.value === 'mermaid')
const isClaude = computed(() => lang.value === 'claude')
const isUrl = computed(() => lang.value === 'url')
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
  const res = await window.api.copyText(content)
  if (!res?.ok) return diff.showNotice(t('snippetRow.copyFailed'))
  flash()
}
async function viewDiagram(entry) {
  const code = await store.load(entry.id)
  if (code != null) ui.openMermaid(entry.name, code)
}
// Opening is gated by the main-process claude.ai allowlist; this only offers a
// candidate URL from the snippet.
// A URL snippet is the whole link; main fences the scheme and confirms.
async function openUrl() {
  const content = await store.load(props.entry.id)
  const url = content?.trim().split(/\s+/)[0]
  const res = url ? await window.api.openLink(url) : { error: 'empty' }
  if (res?.error) diff.showNotice(t('snippetRow.noOpenableLink'))
}

async function openLink() {
  const content = await store.load(props.entry.id)
  const url = content != null ? firstClaudeUrl(content) : null
  if (url) await window.api.openClaudeLink(url)
  else diff.showNotice(t('snippetRow.noClaudeLink'))
}

// Hovering the name previews the snippet — not the whole row, which made the
// card appear while you were only reaching for the row's buttons.
const emit = defineEmits(['hoverTitle', 'leaveTitle', 'dragging'])

// The preview is anchored to this row, so it sits over the area the drag is
// heading for. Nothing else closes it — the pointer never leaves the row.
// Both payloads on one drag: the pane reads the compare type, a sibling row
// reads the reorder one. Which gesture it was is decided by where it lands.
function onDragStart(e) {
  emit('dragging')
  startDrag(e, props.entry)
  reorder.onDragStart(e, { group: props.group, index: props.index })
}
</script>

<template>
  <li
    class="row"
    :class="[rowState, reorder.classFor(group, index)]"
    :data-new-row="isNew ? entry.id : null"
    :data-tour="isDiagram ? 'snippet-diagram' : null"
    data-preview-anchor
    :draggable="!isSecret(entry)"
    @dragstart="onDragStart($event)"
    v-on="reorder.handlersFor(group, index)"
  >
    <Transition name="flash">
      <span v-if="copied" class="copied-flash" aria-live="polite">{{ $t('common.copied') }}</span>
    </Transition>
    <button
      class="star"
      draggable="false"
      :class="{ on: favorite }"
      :data-tip="favorite ? $t('snippetRow.unfavorite') : $t('snippetRow.favorite')"
      :aria-label="favorite ? $t('snippetRow.unfavorite') : $t('snippetRow.favoritePinToTop')"
      @click="store.toggleFavorite(entry.id)"
    >
      <AppIcon :name="favorite ? 'star-filled' : 'star'" />
    </button>
    <button
      class="entry"
      draggable="false"
      @pointerdown="ui.clearNewRow(entry.id)"
      @click="store.editingSnippet = { id: entry.id }"
      @mouseenter="$emit('hoverTitle', $event)"
      @mouseleave="$emit('leaveTitle')"
    >
      <span
        class="monogram"
        :style="{ '--fam': mono.family }"
        :data-tip="$t('snippetRow.languageTip', { lang })"
        >{{ mono.label }}</span
      >
      <AppIcon v-if="isSecret(entry)" class="secret-mark" name="lock" :data-tip="SECRET_NOTICE" />
      <span class="nm">{{ entry.name }}</span>
      <span
        v-if="entry.vars?.length"
        class="varchip"
        :data-tip="
          $t('snippetRow.placeholderTip', entry.vars.length, {
            named: { n: entry.vars.length, list: entry.vars.join(', ') }
          })
        "
      >
        <AppIcon name="braces" />{{ entry.vars.length }}
      </span>
      <span
        v-if="shownTags.length"
        class="tag-word"
        :style="{ '--tc': store.colorOf(shownTags[0]) }"
      >
        <span class="tw-dot"></span>
        <span class="tw-label">{{ shownTags[0] }}</span>
        <span v-if="shownTags.length > 1" class="tw-more">+{{ shownTags.length - 1 }}</span>
      </span>
    </button>
    <!-- The badge takes the age slot: the age of a row made ten seconds ago is
         not information, and which row is new is. -->
    <span v-if="isNew" class="new-badge">{{ $t('newRow.badge') }}</span>
    <span v-else class="when">{{ ago(entry.createdAt) }}</span>
    <span class="rowacts" draggable="false">
      <button
        v-if="isDiagram"
        class="row-btn"
        :data-tip="$t('snippetRow.diagram')"
        :aria-label="$t('snippetRow.viewDiagram')"
        @click="viewDiagram(entry)"
      >
        <AppIcon name="diagram" />
      </button>
      <button
        v-if="isUrl"
        class="row-btn"
        :data-tip="$t('snippetRow.open')"
        :aria-label="$t('snippetRow.openLinkInBrowser')"
        @click="openUrl"
      >
        <AppIcon name="link" />
      </button>
      <button
        v-if="isClaude"
        class="row-btn"
        :data-tip="$t('snippetRow.open')"
        :aria-label="$t('snippetRow.openClaudeLink')"
        @click="openLink"
      >
        <AppIcon name="link" />
      </button>
      <!-- Never for a secret — the store refuses it too, so this is the affordance. -->
      <button
        v-if="!isSecret(entry)"
        class="row-btn"
        :data-tip="isDiagram ? $t('snippetRow.captureTheDiagram') : $t('snippetRow.capture')"
        :aria-label="$t('snippetRow.exportAsImage')"
        @click="imageExport.exportSnippetImage(entry.id)"
      >
        <AppIcon name="image" />
      </button>
      <button
        class="row-btn"
        :data-tip="$t('common.copy')"
        :aria-label="$t('snippetRow.copyToClipboard')"
        @click="copySnippet(entry.id)"
      >
        <AppIcon name="copy" />
      </button>
      <button
        class="row-btn delete"
        :data-tip="$t('snippetRow.delete')"
        :aria-label="$t('snippetRow.delete')"
        @click="store.requestDelete('snippet', entry.id, entry.name)"
      >
        <AppIcon name="trash" />
      </button>
    </span>
  </li>
</template>

<style scoped src="./styles/SnippetRow.css"></style>
