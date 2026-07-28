<script setup>
// Top bar: stats, display toggles, document actions, theme switch. Every action
// has a menu twin (menu.js / MenuBar.vue).
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { MOD } from '../keys'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()

// The button names its destination (files ⇄ paste).
const inPaste = computed(() => store.mode === 'paste')
const pasteToggleLabel = computed(() => (inPaste.value ? 'File mode' : 'Paste text'))
const pasteToggleTitle = computed(() =>
  inPaste.value ? `Back to comparing files (${MOD}+T)` : `Compare pasted text (${MOD}+T)`
)
</script>

<template>
  <header class="toolbar band">
    <!-- Change counts only; the "no differences" state reads as a row label over
         the diff panes (DiffViewer), not as an empty +0/−0 here. -->
    <span v-if="store.ready && store.stats && !store.identical" class="stats">
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
      </div>

      <span class="divider" />

      <!-- Document actions -->
      <div class="group actions">
        <button
          class="btn btn-ghost"
          :class="{ active: inPaste }"
          :title="pasteToggleTitle"
          @click="store.togglePasteMode"
        >
          {{ pasteToggleLabel }}
        </button>
        <button
          class="btn btn-primary"
          :title="`Save this diff, encrypted and auto-expiring (${MOD}+S)`"
          :disabled="!store.canSave"
          @click="store.showSaveDialog = true"
        >
          Save
        </button>
        <button
          class="btn btn-ghost"
          title="Share this diff as a sealed file for one trusted recipient"
          :disabled="!store.canSave"
          @click="store.shareCurrent()"
        >
          Share
        </button>
        <button
          class="btn btn-ghost"
          :title="
            store.comparableKind === 'text'
              ? `Copy this diff as a unified patch (${MOD}+Shift+C)`
              : 'Copy diff is only available for text comparisons'
          "
          :disabled="!store.ready || store.comparableKind !== 'text'"
          @click="store.copyDiff()"
        >
          <AppIcon name="copy" /> Copy diff
        </button>
        <button
          class="btn btn-ghost"
          :title="`Clear both files (${MOD}+K)`"
          :disabled="!store.left && !store.right"
          @click="store.clear"
        >
          Clear
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped src="./styles/AppToolbar.css"></style>
