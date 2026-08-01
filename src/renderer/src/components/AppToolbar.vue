<script setup>
// Top bar: stats, display toggles, document actions, theme switch. Every action
// has a menu twin (menu.js / MenuBar.vue).
import { computed } from 'vue'
import { STREAMED_LIMITS, useDiffStore } from '../stores/diffStore'
import { MOD } from '../keys'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()

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

// The button names its destination (files ⇄ paste).
const inPaste = computed(() => store.mode === 'paste')
const pasteToggleLabel = computed(() => (inPaste.value ? 'File mode' : 'Paste text'))
const pasteToggleTitle = computed(() =>
  inPaste.value ? `Back to comparing files (${MOD}+T)` : `Compare pasted text (${MOD}+T)`
)
// A grid has no line selection to narrow the picture to, so the tip drops that
// half rather than promising something the viewer cannot do.
const imageTitle = computed(() => {
  if (!store.canExportImage) return 'Load two files to export an image'
  if (store.isSpreadsheet) return 'Export this comparison as an image'
  return 'Export this diff as an image — select lines first to capture just those'
})
// Clear empties the paste panes as well as the file slots.
const clearTitle = computed(() =>
  inPaste.value ? `Clear the pasted text (${MOD}+K)` : `Clear both files (${MOD}+K)`
)
</script>

<template>
  <header class="toolbar band">
    <!-- Change counts only; the "no differences" state reads as a row label over
         the diff panes (DiffViewer), not as an empty +0/−0 here. -->
    <span
      v-if="store.ready && store.stats && !store.identical && store.comparableKind === 'text'"
      class="stats"
    >
      <span class="add">+{{ store.stats.additions }}</span>
      <span class="del">−{{ store.stats.deletions }}</span>
    </span>

    <div class="options">
      <!-- Diff display toggles -->
      <div class="group">
        <label>
          <input v-model="store.renderSideBySide" type="checkbox" />
          Split view
        </label>
        <label>
          <input v-model="store.ignoreTrimWhitespace" type="checkbox" />
          Ignore whitespace
        </label>
        <label
          v-if="store.canCompareStructure"
          :data-tip="`Compare as ${store.structuredFormat.toUpperCase()} data — key order and formatting stop counting (${MOD}+Shift+D)`"
        >
          <input v-model="store.semanticView" type="checkbox" />
          Structure
        </label>
      </div>

      <span class="divider" />

      <!-- Document actions -->
      <div class="group actions">
        <button
          class="btn btn-ghost"
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
          class="btn btn-ghost"
          :data-tip="shareTip"
          :disabled="!store.canSave"
          @click="store.shareCurrent()"
        >
          Share
        </button>
        <button
          class="btn btn-ghost"
          :data-tip="copyTip"
          :disabled="!store.ready || store.comparableKind !== 'text'"
          @click="store.copyDiff()"
        >
          <AppIcon name="copy" /> Copy diff
        </button>
        <button
          class="btn btn-ghost"
          :data-tip="imageTitle"
          :disabled="!store.canExportImage"
          @click="store.exportCurrentImage()"
        >
          <AppIcon name="image" /> Image
        </button>
        <button
          class="btn btn-ghost"
          :data-tip="clearTitle"
          :disabled="!store.hasActive"
          @click="store.clear"
        >
          Clear
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped src="./styles/AppToolbar.css"></style>
