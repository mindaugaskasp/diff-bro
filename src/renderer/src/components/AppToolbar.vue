<script setup>
// Top bar: stats, display toggles, document actions, theme switch. Every action
// has a menu twin (menu.js / MenuBar.vue).
import { computed } from 'vue'
import { STREAMED_LIMITS, useDiffStore } from '../stores/diffStore'
import { useImageExportStore } from '../features/imageExport'
import { MOD } from '../keys'
import AppIcon from './AppIcon.vue'
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
    : 'Share this diff as a sealed file for one trusted recipient'
)
const copyTip = computed(() => {
  if (store.isStreamed) return STREAMED_LIMITS.copy
  if (store.comparableKind !== 'text') return 'Copy diff is only available for text comparisons'
  return `Copy this diff as a unified patch (${MOD}+Shift+C)`
})

// Each view explains what it gives rather than naming a format it may not have:
// a diagram and delimited text both reach this toggle with structuredFormat null.
const structureTip = computed(() => {
  if (store.canCompareDiagram) {
    return `Compare as diagrams — one picture carrying both revisions, so an inserted node cannot read as a rewrite (${MOD}+Shift+D)`
  }
  if (store.delimitedFormat) {
    return `Compare as a grid — rows aligned by their first column, changes shown per cell (${MOD}+Shift+D)`
  }
  return `Compare as ${String(store.structuredFormat ?? '').toUpperCase()} data — key order and formatting stop counting (${MOD}+Shift+D)`
})

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
    <!-- Change counts live in the status band under the panes (DiffViewer), in
         the same words the diagram diff uses. -->
    <div class="options">
      <!-- Diff display toggles -->
      <div class="group">
        <!-- A control that cannot act should not be offered: Split view beside
             a grid reads as broken, not as N/A. The two do NOT have the same
             reach — the diagram viewer splits on the same flag (see
             utils/viewChrome.js), which is why they are gated separately. -->
        <label v-if="splitAvailable">
          <input v-model="store.renderSideBySide" type="checkbox" />
          Split view
        </label>
        <label v-if="whitespaceAvailable">
          <input v-model="store.ignoreTrimWhitespace" type="checkbox" />
          Ignore whitespace
        </label>
        <label v-if="store.canCompareStructure || store.canCompareDiagram" :data-tip="structureTip">
          <input v-model="store.semanticView" type="checkbox" />
          {{ store.structureLabel }}
        </label>
        <label
          v-if="store.comparableKind === 'diagram'"
          data-tip="Show only what changed plus one hop of context — the rest is hidden and counted"
        >
          <input v-model="store.diagramFocus" type="checkbox" />
          Focus on changes
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
          Save
        </button>
        <button
          class="btn"
          data-tour="share"
          :data-tip="shareTip"
          :disabled="!store.canSave"
          @click="share.shareCurrent()"
        >
          Share
        </button>
        <button
          class="btn"
          :data-tip="copyTip"
          :disabled="!store.ready || store.comparableKind !== 'text'"
          @click="store.copyDiff()"
        >
          <AppIcon name="copy" /> Copy diff
        </button>
        <button
          class="btn"
          :data-tip="imageTitle"
          :disabled="!imageExport.canExportImage"
          @click="imageExport.exportCurrentImage()"
        >
          <AppIcon name="image" /> Capture
        </button>
        <button
          v-if="!store.isSavedDiff"
          class="btn"
          :data-tip="clearTitle"
          :disabled="!store.canClear"
          @click="store.clear"
        >
          Clear
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped src="./styles/AppToolbar.css"></style>
