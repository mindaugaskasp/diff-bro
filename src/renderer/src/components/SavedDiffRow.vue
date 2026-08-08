<script setup>
// One saved-diff row. Two lines, led by a type monogram (like a snippet): name
// + lifetime on top, format · sender · tag beneath. Imported rows add the sender
// and a trusted-sender mark — every stored external diff was signature-verified
// against a trusted key at import (openSealed rejects any other), so it's honest.
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useImageExportStore } from '../features/imageExport'
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { openSavedDiff } from '../composables/useSavedDiffOpen'
import { useDataDir } from '../composables/useDataDir'
import { languageMonogram } from '../utils/languageMonogram'
import { DIFF_DRAG_TYPE, setRowDragPayload } from '../utils/snippetSource'
import { injectRowReorder } from '../composables/useRowReorder'
import { t } from '../i18n'
import { rowFormatKey, rowTags } from '../utils/diffRowTags'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'
import { useShareStore } from '../features/share'
import { useUiStore } from '../stores/uiStore'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').VaultEntry>} */
  entry: { type: Object, required: true, validator: shaped('id', 'name', 'expiresAt', 'from') },
  /** Which reorderable list this row is in, and where in the FULL group. */
  group: { type: String, default: '' },
  index: { type: Number, default: -1 }
})

const vault = useVaultStore()
const reorder = injectRowReorder()
const ui = useUiStore()
const share = useShareStore()
const imageExport = useImageExportStore()
const diff = useDiffStore()
const snippets = useSnippetStore()
const dataDir = useDataDir()

const SOON_MS = 15 * 60_000
const isNew = computed(() => ui.lastCreatedRowId === props.entry.id)
const formatKey = computed(() => rowFormatKey(props.entry))
const mono = computed(() => languageMonogram(formatKey.value))
const shownTags = computed(() => rowTags(props.entry))
const tagColor = (t) => snippets.colorOf(t) || 'var(--text-dim)'

const title = computed(() => {
  const from = props.entry.from ? t('savedDiffRow.fromSender', { who: props.entry.from }) : ''
  const loc = dataDir.value ? t('savedDiffRow.savedIn', { dir: dataDir.value }) : ''
  return t('savedDiffRow.openTip', { name: props.entry.name, from, loc })
})

// Live lifetime (vault.now ticks each second): kept, a countdown warming to
// "soon" in the last stretch, then expired.
const state = computed(() => {
  if (props.entry.expiresAt === null) return { cls: 'kept', text: '' }
  const ms = props.entry.expiresAt - vault.now
  if (ms <= 0) return { cls: 'expired', text: 'expired' }
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const text = h > 0 ? `${h}h ${m}m left` : m > 0 ? `${m}m ${s}s left` : `${s}s left`
  return { cls: ms <= SOON_MS ? 'soon' : 'left', text }
})

async function open() {
  const ok = await openSavedDiff(props.entry.id)
  if (!ok) diff.showNotice(t('savedDiffRow.expiredOrUndecryptable'))
}

// A row is also a handle: drop it in the comparison column to open it there.
// Only the id travels, exactly as a snippet drag does.
// Both payloads on one drag: the pane reads the compare type, a sibling row
// reads the reorder one. Where it lands decides which gesture it was.
function onDragStart(e) {
  setRowDragPayload(e.dataTransfer, DIFF_DRAG_TYPE, [props.entry.id])
  reorder.onDragStart(e, { group: props.group, index: props.index })
}
</script>

<template>
  <li
    class="diff"
    :class="[
      {
        favorite: entry.favorite,
        external: entry.from,
        'is-new': isNew,
        'is-moved': ui.lastMovedRowId === entry.id
      },
      reorder.classFor(group, index)
    ]"
    :data-new-row="isNew ? entry.id : null"
    draggable="true"
    @dragstart="onDragStart"
    v-on="reorder.handlersFor(group, index)"
  >
    <button
      class="star"
      :class="{ on: entry.favorite }"
      :data-tip="
        entry.favorite ? $t('savedDiffRow.removeFromFavorites') : $t('savedDiffRow.pinToTheTop')
      "
      :aria-label="
        entry.favorite ? $t('savedDiffRow.unfavorite') : $t('savedDiffRow.favoritePinToTop')
      "
      @click="vault.toggleFavorite(entry.id)"
    >
      <AppIcon :name="entry.favorite ? 'star-filled' : 'star'" />
    </button>

    <button class="stack" :data-tip="title" @pointerdown="ui.clearNewRow(entry.id)" @click="open">
      <span
        class="monogram"
        :style="{ '--fam': mono.family }"
        :data-tip="
          formatKey
            ? $t('savedDiffRow.formatTip', { format: formatKey })
            : $t('savedDiffRow.plainTextComparison')
        "
        >{{ mono.label }}</span
      >
      <span class="lines">
        <span class="l1">
          <span class="name">{{ entry.name }}</span>
          <span v-if="state.text" class="state-chip" :class="state.cls">{{ state.text }}</span>
          <!-- Beside the lifetime, not instead of it: how long a diff has left
               is information a ten-second-old snippet's age is not. -->
          <span v-if="isNew" class="new-badge">{{ $t('newRow.badge') }}</span>
        </span>
        <span class="l2">
          <template v-if="entry.from">
            <span class="from">{{ $t('savedDiffRow.from', { who: entry.from }) }}</span>
            <span class="trust-mark" :data-tip="$t('savedDiffRow.verifiedTheSignatureMatchedA')">
              <AppIcon name="shield-check" />
            </span>
          </template>
          <template v-if="shownTags.length">
            <span v-if="entry.from" class="sep">·</span>
            <span class="tag-word" :style="{ '--tc': tagColor(shownTags[0]) }">
              <span class="tw-dot"></span>
              <span class="tw-label">{{ shownTags[0] }}</span>
              <span v-if="shownTags.length > 1" class="tw-more">+{{ shownTags.length - 1 }}</span>
            </span>
          </template>
          <span v-else-if="!entry.from" class="untagged">{{ $t('savedDiffRow.untagged') }}</span>
        </span>
      </span>
    </button>

    <span class="diffacts">
      <button
        v-if="entry.format !== 'excel'"
        class="row-btn"
        :data-tip="$t('savedDiffRow.exportThisDiffAsA')"
        :aria-label="$t('savedDiffRow.exportAsImage')"
        @click="imageExport.exportImage(entry.id)"
      >
        <AppIcon name="image" />
      </button>
      <button
        class="row-btn"
        :data-tip="$t('savedDiffRow.editThisDiffSTags')"
        :aria-label="$t('savedDiffRow.editTags')"
        @click="vault.requestRetag(entry.id)"
      >
        <AppIcon name="tag" />
      </button>
      <button
        v-if="!entry.from"
        class="row-btn"
        :data-tip="$t('savedDiffRow.sealThisDiffForThe')"
        :aria-label="$t('savedDiffRow.shareAsSealedFile')"
        @click="share.shareEntry(entry.id)"
      >
        <AppIcon name="share" />
      </button>
      <button
        class="row-btn delete"
        :data-tip="$t('savedDiffRow.deleteThisSavedDiffNow')"
        :aria-label="$t('savedDiffRow.deleteNow')"
        @click="vault.requestDelete(entry.id, entry.name)"
      >
        <AppIcon name="trash" />
      </button>
    </span>
  </li>
</template>

<style scoped src="./styles/SavedDiffRow.css"></style>
