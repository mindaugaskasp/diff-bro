<script setup>
// One snippet row (shared by both shelves; only the star state differs). Leads
// with a language monogram so the row is recognizable before the name is read.
import { computed } from 'vue'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { languageMonogram } from '../utils/languageMonogram'
import { ago } from '../utils/relativeTime'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'
import { SECRET_NOTICE, isSecret } from '../utils/secretSnippet'
import { useSnippetDrag } from '../composables/useSnippetDrag'
import { injectRowReorder } from '../composables/useRowReorder'
import { useUiStore } from '../stores/uiStore'
import { useRowTags } from '../composables/useRowTags'
import { useSnippetRowActions } from '../composables/useSnippetRowActions'
import { rowColorHex, rowColorId } from '../utils/rowColor'

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
const { copied, copySnippet, viewDiagram, openUrl, openLink } = useSnippetRowActions(
  () => props.entry
)
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
const { shown: shownTags } = useRowTags(() => props.entry.tags.filter((t) => t !== lang.value))
const colorHex = computed(() => rowColorHex(props.entry.color))
// Right-click is the way in — the gesture that already opens a tag's manage
// popover from the shelf.
const openColorMenu = (e) => (ui.rowColorMenu = { id: props.entry.id, x: e.clientX, y: e.clientY })

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
    :data-color="rowColorId(entry.color)"
    :style="colorHex ? { '--snip-color': colorHex } : null"
    data-preview-anchor
    :draggable="!isSecret(entry)"
    @dragstart="onDragStart($event)"
    @contextmenu.prevent="openColorMenu($event)"
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
        @click="viewDiagram()"
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
      <button
        class="row-btn"
        :data-tip="$t('common.copy')"
        :aria-label="$t('snippetRow.copyToClipboard')"
        @click="copySnippet()"
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
