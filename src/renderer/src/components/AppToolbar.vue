<script setup>
// Top bar: diff stats, the display toggles, the document actions, and the
// theme switch. Every action here has a menu twin (src/main/menu.js and
// MenuBar.vue) — this is the pointer-friendly half.
import { useDiffStore } from '../stores/diffStore'
import { MOD } from '../keys'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()
</script>

<template>
  <header class="toolbar band">
    <span v-if="store.ready && store.stats" class="stats">
      <span v-if="store.identical" class="identical">No differences</span>
      <template v-else>
        <span class="add">+{{ store.stats.additions }}</span>
        <span class="del">−{{ store.stats.deletions }}</span>
      </template>
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
          :class="{ active: store.mode === 'paste' }"
          :title="`Compare pasted text (${MOD}+T)`"
          @click="store.togglePasteMode"
        >
          Paste text
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
          :title="`Copy this diff as a unified patch (${MOD}+Shift+C)`"
          :disabled="!store.ready"
          @click="store.copyDiff()"
        >
          <AppIcon name="copy" /> Copy diff
        </button>
        <button class="btn btn-ghost" :disabled="!store.left && !store.right" @click="store.clear">
          Clear
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped src="./styles/AppToolbar.css"></style>
