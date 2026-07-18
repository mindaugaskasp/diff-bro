<script setup>
import { useDiffStore } from './stores/diffStore'
import FileSlot from './components/FileSlot.vue'
import DiffViewer from './components/DiffViewer.vue'
import PasteInput from './components/PasteInput.vue'
import ShortcutBar from './components/ShortcutBar.vue'
import SavedDiffs from './components/SavedDiffs.vue'
import SaveDiffDialog from './components/SaveDiffDialog.vue'
import ShareDiffDialog from './components/ShareDiffDialog.vue'
import { MOD } from './keys'

const store = useDiffStore()

window.api.onMenuAction((action) => store.handleMenuAction(action))
</script>

<template>
  <div class="app">
    <ShortcutBar />

    <header class="toolbar">
      <span class="logo">DiffBro</span>

      <div class="slots">
        <FileSlot side="left" :file="store.left" @pick="store.pick('left')" @drop-path="(p) => store.drop('left', p)" />
        <button class="ghost" :title="`Swap sides (${MOD}+Shift+S)`" :disabled="!store.ready" @click="store.swap">⇄</button>
        <FileSlot side="right" :file="store.right" @pick="store.pick('right')" @drop-path="(p) => store.drop('right', p)" />
      </div>

      <span v-if="store.ready && store.stats" class="stats">
        <span class="add">+{{ store.stats.additions }}</span>
        <span class="del">−{{ store.stats.deletions }}</span>
      </span>

      <div class="options">
        <label>
          <input type="checkbox" v-model="store.renderSideBySide" />
          Split view
        </label>
        <label>
          <input type="checkbox" v-model="store.ignoreTrimWhitespace" />
          Ignore whitespace
        </label>
        <button
          class="ghost"
          :class="{ active: store.mode === 'paste' }"
          :title="`Compare pasted text (${MOD}+T)`"
          @click="store.togglePasteMode"
        >
          Paste text
        </button>
        <button
          class="ghost"
          :title="`Save this diff, encrypted and auto-expiring (${MOD}+S)`"
          :disabled="!store.canSave"
          @click="store.showSaveDialog = true"
        >
          Save
        </button>
        <button class="ghost" :disabled="!store.left && !store.right" @click="store.clear">Clear</button>
      </div>
    </header>

    <div class="body">
      <SavedDiffs />
      <main class="content">
        <PasteInput v-if="store.mode === 'paste'" />
        <DiffViewer v-else-if="store.ready" />
        <div v-else class="empty">
          <p>Choose or drop two files to compare.</p>
        </div>
      </main>
    </div>

    <SaveDiffDialog v-if="store.showSaveDialog" />
    <ShareDiffDialog v-if="store.shareEntryId" />

    <transition name="fade">
      <div v-if="store.notice" class="notice">{{ store.notice }}</div>
    </transition>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
}
.logo {
  font-weight: 700;
  letter-spacing: 0.5px;
}
.slots {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.stats {
  display: flex;
  gap: 8px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.stats .add {
  color: #3fb950;
}
.stats .del {
  color: #f85149;
}
.options {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-dim);
  white-space: nowrap;
}
.options label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 4px 10px;
  cursor: pointer;
}
.ghost.active {
  border-color: var(--accent);
  color: var(--accent);
}
.ghost:disabled {
  opacity: 0.4;
  cursor: default;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.content {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
}
.notice {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 10px 16px;
  max-width: 70%;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
