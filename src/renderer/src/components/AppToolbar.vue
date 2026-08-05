<script setup>
// Top bar: stats, display toggles, document actions, theme switch. Every action
// has a menu twin (menu.js / MenuBar.vue).
import { computed } from 'vue'
import { STREAMED_LIMITS, useDiffStore } from '../stores/diffStore'
import { useImageExportStore } from '../features/imageExport'
import { MOD } from '../keys'
import AppIcon from './AppIcon.vue'
import KeyActions from './KeyActions.vue'
import { useShareStore } from '../features/share'
import { showsSplitView, showsWhitespaceToggle } from '../utils/viewChrome'

const store = useDiffStore()
const share = useShareStore()
const imageExport = useImageExportStore()

// A disabled control has to say WHY, and a streamed comparison disables three of
// them for the same underlying reason with three different consequences.
const saveTip = computed(() => {
  if (store.isStreamed) return STREAMED_LIMITS.save
  if (store.canSave && !store.hasUnsavedWork) {
    return 'Already saved — change something to save it again'
  }
  return `Save this diff to the sidebar (${MOD}+S)`
})
const shareTip = computed(() =>
  store.isStreamed
    ? STREAMED_LIMITS.share
    : 'Share this diff as a sealed file, for the trusted people you pick'
)
const copyTip = computed(() => {
  if (store.isStreamed) return STREAMED_LIMITS.copy
  if (store.comparableKind !== 'text') return 'Copy diff is only available for text comparisons'
  return `Copy this diff as a unified patch (${MOD}+Shift+C)`
})

// Each view explains what it gives rather than naming a format it may not have:
// a diagram and delimited text both reach this toggle with structuredFormat null.
// A greyed-out toggle says why instead — it keeps its slot, so it has to.
const structureAvailable = computed(() => store.canCompareStructure || store.canCompareDiagram)
const focusAvailable = computed(() => store.comparableKind === 'diagram')

const structureTip = computed(() => {
  if (!structureAvailable.value) return 'These two files have no structured view — only a text diff'
  if (store.canCompareDiagram) {
    return `Compare as diagrams — one picture carrying both revisions, so an inserted node cannot read as a rewrite (${MOD}+Shift+D)`
  }
  if (store.delimitedFormat) {
    return `Compare as a grid — rows aligned by their first column, changes shown per cell (${MOD}+Shift+D)`
  }
  return `Compare as ${String(store.structuredFormat ?? '').toUpperCase()} data — key order and formatting stop counting (${MOD}+Shift+D)`
})
const splitTip = computed(() =>
  splitAvailable.value
    ? 'Show the two revisions side by side'
    : 'Side by side applies to text and diagram comparisons'
)
const whitespaceTip = computed(() =>
  whitespaceAvailable.value
    ? 'Treat lines that differ only in leading or trailing spaces as unchanged'
    : 'Whitespace only means something in a text comparison'
)
const focusTip = computed(() =>
  focusAvailable.value
    ? 'Show only what changed plus one hop of context — the rest is hidden and counted'
    : 'Focus applies to a diagram comparison'
)

// The button names its destination (files ⇄ paste).
const splitAvailable = computed(() => showsSplitView(store))
const whitespaceAvailable = computed(() => showsWhitespaceToggle(store))
const inPaste = computed(() => store.mode === 'paste')
const pasteToggleLabel = computed(() => (inPaste.value ? 'File mode' : 'Paste text'))
const pasteToggleTitle = computed(() =>
  inPaste.value ? `Back to comparing files (${MOD}+T)` : `Compare pasted text (${MOD}+T)`
)
// A grid has no line selection to narrow the picture to, so the tip drops that
// half rather than promising something the viewer cannot do.
const imageTitle = computed(() => {
  if (!imageExport.canExportImage) return 'Load two files to export an image'
  if (store.isSpreadsheet) return 'Export this comparison as an image'
  return 'Export this diff as an image — select lines first to capture just those'
})
// Clear empties the paste panes as well as the file slots. It leaves the bar
// entirely on a vault-backed diff, which has nothing of its own to throw away.
const clearTitle = computed(() =>
  inPaste.value ? `Clear the pasted text (${MOD}+K)` : `Clear both files (${MOD}+K)`
)
</script>

<template>
  <header class="toolbar band">
    <!-- Left of everything: `.options` is margin-left:auto, so this sits over
         the sidebar, beside the library these two set up. -->
    <KeyActions />
    <!-- Change counts live in the status band under the panes (DiffViewer), in
         the same words the diagram diff uses. -->
    <div class="options">
      <!-- Diff display toggles -->
      <div class="group">
        <!-- Every toggle keeps its slot and greys out when it cannot act, rather
             than being removed. Hiding them made the row re-flow on each press:
             turning Diagram off swapped "Focus on changes" for "Ignore
             whitespace" and slid the control you had just clicked 150px sideways
             under the cursor. A disabled control with a reason reads as N/A; a
             row that jumps reads as a misclick. -->
        <label :class="{ off: !splitAvailable }" :data-tip="splitTip">
          <input v-model="store.renderSideBySide" type="checkbox" :disabled="!splitAvailable" />
          {{ $t('appToolbar.splitView') }}
        </label>
        <label :class="{ off: !structureAvailable }" :data-tip="structureTip">
          <input v-model="store.semanticView" type="checkbox" :disabled="!structureAvailable" />
          {{ store.structureLabel }}
        </label>
        <label :class="{ off: !whitespaceAvailable }" :data-tip="whitespaceTip">
          <input
            v-model="store.ignoreTrimWhitespace"
            type="checkbox"
            :disabled="!whitespaceAvailable"
          />
          {{ $t('appToolbar.ignoreWhitespace') }}
        </label>
        <label :class="{ off: !focusAvailable }" :data-tip="focusTip">
          <input v-model="store.diagramFocus" type="checkbox" :disabled="!focusAvailable" />
          {{ $t('appToolbar.focusOnChanges') }}
        </label>
      </div>

      <span class="divider" />

      <!-- Document actions -->
      <div class="group actions">
        <!-- Setting up a comparison, not viewing one: a vault-backed tab has
             nothing to switch the input mode OF, and offering it there invites a
             click that would replace what the reader opened. Reserved for a new
             or empty tab (isSavedDiff is the same test Clear already uses). -->
        <button
          v-if="!store.isSavedDiff"
          class="btn"
          :class="{ active: inPaste }"
          :data-tip="pasteToggleTitle"
          @click="store.togglePasteMode"
        >
          {{ pasteToggleLabel }}
        </button>
        <button
          class="btn btn-primary"
          :data-tip="saveTip"
          :disabled="!store.hasUnsavedWork"
          @click="store.showSaveDialog = true"
        >
          {{ $t('common.save') }}
        </button>
        <button
          class="btn"
          data-tour="share"
          :data-tip="shareTip"
          :disabled="!store.canSave"
          @click="share.shareCurrent()"
        >
          {{ $t('appToolbar.share') }}
        </button>
        <button
          class="btn"
          :data-tip="copyTip"
          :disabled="!store.ready || store.comparableKind !== 'text'"
          @click="store.copyDiff()"
        >
          <AppIcon name="copy" /> {{ $t('appToolbar.copyDiff') }}
        </button>
        <button
          class="btn"
          :data-tip="imageTitle"
          :disabled="!imageExport.canExportImage"
          @click="imageExport.exportCurrentImage()"
        >
          <AppIcon name="image" /> {{ $t('appToolbar.capture') }}
        </button>
        <button
          v-if="!store.isSavedDiff"
          class="btn"
          :data-tip="clearTitle"
          :disabled="!store.canClear"
          @click="store.clear"
        >
          {{ $t('appToolbar.clear') }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped src="./styles/AppToolbar.css"></style>
