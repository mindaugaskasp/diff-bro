<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { useDiffStore } from './stores/diffStore'
import FileSlot from './components/FileSlot.vue'
import DiffViewer from './components/DiffViewer.vue'
import PasteInput from './components/PasteInput.vue'
import ShortcutBar from './components/ShortcutBar.vue'
import MenuBar from './components/MenuBar.vue'
import SavedDiffs from './components/SavedDiffs.vue'
import SaveDiffDialog from './components/SaveDiffDialog.vue'
import ShareDiffDialog from './components/ShareDiffDialog.vue'
import FormatHintBanner from './components/FormatHintBanner.vue'
import Base64Dialog from './components/Base64Dialog.vue'
import JsonToolDialog from './components/JsonToolDialog.vue'
import XmlToolDialog from './components/XmlToolDialog.vue'
import SqlToolDialog from './components/SqlToolDialog.vue'
import EncryptDecryptDialog from './components/EncryptDecryptDialog.vue'
import SnippetEditorDialog from './components/SnippetEditorDialog.vue'
import SnippetPassphraseDialog from './components/SnippetPassphraseDialog.vue'
import SnippetDeleteDialog from './components/SnippetDeleteDialog.vue'
import VaultCategoryDeleteDialog from './components/VaultCategoryDeleteDialog.vue'
import AddTrustedKeyDialog from './components/AddTrustedKeyDialog.vue'
import TrustedKeysDialog from './components/TrustedKeysDialog.vue'
import ShareKeyDialog from './components/ShareKeyDialog.vue'
import ConfigBackupDialog from './components/ConfigBackupDialog.vue'
import { useSnippetStore } from './stores/snippetStore'
import { useVaultStore } from './stores/vaultStore'
import { MOD, isMac } from './keys'

const store = useDiffStore()
const snippets = useSnippetStore()
const vault = useVaultStore()

store.initTheme()
window.api.onMenuAction((action) => store.handleMenuAction(action))
// Live re-diff: whenever the window regains focus, re-read loaded files so
// external edits show up without reopening anything.
window.addEventListener('focus', () => store.refreshFromDisk())

// --- Resizable sidebar (drag the divider between the sidebar and the diff) ---
const SIDEBAR_KEY = 'diffbro.sidebarWidth'
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 640
const clampSidebar = (w) => Math.min(Math.max(w, SIDEBAR_MIN), SIDEBAR_MAX)

const sidebarWidth = ref(clampSidebar(Number(localStorage.getItem(SIDEBAR_KEY)) || 220))

let dragStartX = 0
let dragStartWidth = 0

function onResizeMove(e) {
  sidebarWidth.value = clampSidebar(dragStartWidth + (e.clientX - dragStartX))
}
function onResizeEnd() {
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  localStorage.setItem(SIDEBAR_KEY, String(Math.round(sidebarWidth.value)))
}
function startResize(e) {
  dragStartX = e.clientX
  dragStartWidth = sidebarWidth.value
  // Suppress text selection and keep the resize cursor during the drag.
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
})

// --- Drag & drop files anywhere on the window ---
// A dragenter/dragleave counter avoids the flicker you'd get from child
// elements firing dragleave as the cursor moves over them.
const dragDepth = ref(0)
const dragActive = ref(false)

function hasFiles(e) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}
function onDragEnter(e) {
  // The snippet editor handles its own file drops; don't show the diff
  // drop overlay over it.
  if (!hasFiles(e) || snippets.editingSnippet) return
  dragDepth.value += 1
  dragActive.value = true
}
function onDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) dragActive.value = false
}
async function onDrop(e) {
  dragDepth.value = 0
  dragActive.value = false
  if (!hasFiles(e) || snippets.editingSnippet) return
  const paths = Array.from(e.dataTransfer.files)
    .map((f) => window.api.getPathForFile(f))
    .filter(Boolean)
  if (!paths.length) return
  // A dropped public key opens the "name this trusted key" dialog instead
  // of loading a diff.
  const keyPath = paths.find((p) => p.toLowerCase().endsWith('.diffbrokey'))
  if (keyPath) {
    await store.receiveDroppedKey(keyPath)
    return
  }
  // If the drop landed on a specific file slot, target that side.
  const targetSide = e.target.closest?.('[data-side]')?.dataset.side ?? null
  await store.dropFiles(paths, targetSide)
}
</script>

<template>
  <div
    class="app"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <MenuBar v-if="!isMac" />
    <ShortcutBar />

    <header class="toolbar">
      <span class="logo">Diff Bro</span>

      <span v-if="store.ready && store.stats" class="stats">
        <span class="add">+{{ store.stats.additions }}</span>
        <span class="del">−{{ store.stats.deletions }}</span>
      </span>

      <div class="options">
        <label>
          <input v-model="store.renderSideBySide" type="checkbox" />
          Split view
        </label>
        <label>
          <input v-model="store.ignoreTrimWhitespace" type="checkbox" />
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
        <button
          class="ghost"
          title="Share this diff as a sealed file for one trusted recipient"
          :disabled="!store.canSave"
          @click="store.shareCurrent()"
        >
          Share
        </button>
        <button class="ghost" :disabled="!store.left && !store.right" @click="store.clear">
          Clear
        </button>
        <button
          class="ghost"
          :title="`Switch to ${store.theme === 'dark' ? 'light' : 'dark'} theme (${MOD}+D)`"
          @click="store.toggleTheme()"
        >
          {{ store.theme === 'dark' ? '☀' : '🌙' }}
        </button>
      </div>
    </header>

    <div class="body">
      <SavedDiffs :style="{ width: sidebarWidth + 'px' }" />
      <div class="resizer" title="Drag to resize" @mousedown="startResize"></div>
      <main class="content">
        <div v-if="store.mode !== 'paste'" class="file-slots-row">
          <div class="slot-half">
            <FileSlot side="left" :file="store.left" @pick="store.pick('left')" />
          </div>
          <button
            class="ghost swap"
            :title="`Swap sides (${MOD}+Shift+S)`"
            :disabled="!store.ready"
            @click="store.swap"
          >
            ⇄
          </button>
          <div class="slot-half">
            <FileSlot side="right" :file="store.right" @pick="store.pick('right')" />
          </div>
        </div>

        <PasteInput v-if="store.mode === 'paste'" />
        <template v-else-if="store.ready">
          <FormatHintBanner side="left" />
          <FormatHintBanner side="right" />
          <DiffViewer />
        </template>
        <div v-else class="empty">
          <p>Choose or drop two files to compare.</p>
        </div>
      </main>
    </div>

    <SaveDiffDialog v-if="store.showSaveDialog" />
    <ShareDiffDialog v-if="store.shareEntryId" />
    <TrustedKeysDialog v-if="store.showTrustedKeysDialog" />
    <ShareKeyDialog v-if="store.showShareKeyDialog" />
    <ConfigBackupDialog v-if="store.configMode" />
    <AddTrustedKeyDialog v-if="store.pendingTrustedKey" />
    <Base64Dialog v-if="store.showBase64Dialog" />
    <JsonToolDialog v-if="store.showJsonToolDialog" />
    <XmlToolDialog v-if="store.showXmlToolDialog" />
    <SqlToolDialog v-if="store.showSqlToolDialog" />
    <EncryptDecryptDialog v-if="store.showCryptDialog" />
    <SnippetEditorDialog v-if="snippets.editingSnippet" />
    <SnippetPassphraseDialog v-if="snippets.pendingExport || snippets.pendingImport" />
    <SnippetDeleteDialog v-if="snippets.pendingDelete" />
    <VaultCategoryDeleteDialog v-if="vault.pendingDelete" />

    <transition name="fade">
      <div v-if="store.notice" class="notice">{{ store.notice }}</div>
    </transition>

    <transition name="fade">
      <div v-if="dragActive" class="drop-overlay">
        <div class="drop-card">Drop up to two files to compare</div>
      </div>
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
}
.logo {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.file-slots-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-panel);
}
.slot-half {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: center;
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
.resizer {
  flex: 0 0 5px;
  cursor: col-resize;
  background: var(--border);
  transition: background 0.12s;
}
.resizer:hover {
  background: var(--accent);
}
.content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
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
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent) 14%, rgba(0, 0, 0, 0.45));
  pointer-events: none;
}
.drop-card {
  border: 2px dashed var(--accent);
  border-radius: 12px;
  background: var(--bg-panel);
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  padding: 28px 44px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
</style>
