<script setup>
import { computed, ref } from 'vue'
import { useDiffStore } from './stores/diffStore'
import FileSlot from './components/FileSlot.vue'
import DiffViewer from './components/DiffViewer.vue'
import PasteInput from './components/PasteInput.vue'
import ShortcutBar from './components/ShortcutBar.vue'
import MenuBar from './components/MenuBar.vue'
import SavedDiffs from './components/SavedDiffs.vue'
import SaveDiffDialog from './components/SaveDiffDialog.vue'
import ShareDiffDialog from './components/ShareDiffDialog.vue'
import ReplaceDiffDialog from './components/ReplaceDiffDialog.vue'
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
import SettingsDialog from './components/SettingsDialog.vue'
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

// The sidebar is a fixed width (see SavedDiffs.vue) — deliberately not
// resizable, so the layout stays predictable across sessions.

// --- Drag & drop files anywhere on the window ---
// A dragenter/dragleave counter avoids the flicker you'd get from child
// elements firing dragleave as the cursor moves over them.
const dragDepth = ref(0)
const dragActive = ref(false)

function hasFiles(e) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}
// The snippet editor and the Tools dialogs handle their own file drops (into
// their input), so the window-level diff drop must stand down while one is
// open — otherwise a drop on the dialog's backdrop would load a diff behind it.
const dropSuppressed = computed(
  () =>
    !!snippets.editingSnippet ||
    store.showBase64Dialog ||
    store.showJsonToolDialog ||
    store.showXmlToolDialog ||
    store.showSqlToolDialog ||
    store.showCryptDialog
)
function onDragEnter(e) {
  if (!hasFiles(e) || dropSuppressed.value) return
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
  if (!hasFiles(e) || dropSuppressed.value) return
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
            class="ghost"
            :class="{ active: store.mode === 'paste' }"
            :title="`Compare pasted text (${MOD}+T)`"
            @click="store.togglePasteMode"
          >
            Paste text
          </button>
          <button
            class="save"
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
        </div>

        <span class="divider" />

        <!-- Appearance -->
        <button
          class="icon-btn"
          :title="`Switch to ${store.theme === 'dark' ? 'light' : 'dark'} theme (${MOD}+D)`"
          @click="store.toggleTheme()"
        >
          {{ store.theme === 'dark' ? '☀' : '🌙' }}
        </button>
      </div>
    </header>

    <div class="body">
      <SavedDiffs />
      <main class="content">
        <div v-if="store.mode !== 'paste'" class="file-slots-row">
          <div class="slot-half">
            <FileSlot
              side="left"
              :file="store.left"
              :awaiting="!store.left && !!store.right"
              @pick="store.pick('left')"
            />
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
            <FileSlot
              side="right"
              :file="store.right"
              :awaiting="!store.right && !!store.left"
              @pick="store.pick('right')"
            />
          </div>
        </div>

        <PasteInput v-if="store.mode === 'paste'" />
        <template v-else-if="store.ready">
          <FormatHintBanner side="left" />
          <FormatHintBanner side="right" />
          <DiffViewer />
        </template>
        <!-- One side loaded: make it obvious a second file is still needed. -->
        <div v-else-if="store.left || store.right" class="empty waiting">
          <p class="waiting-title">
            Loaded <strong>{{ (store.left || store.right).name }}</strong>
          </p>
          <p>
            Now drop or choose the
            <strong>{{ store.left ? 'right' : 'left' }}</strong> file to compare.
          </p>
        </div>
        <div v-else class="empty">
          <p>Choose or drop two files to compare.</p>
        </div>
      </main>
    </div>

    <SaveDiffDialog v-if="store.showSaveDialog" />
    <ReplaceDiffDialog v-if="store.pendingReplace" />
    <ShareDiffDialog v-if="store.shareEntryId" />
    <TrustedKeysDialog v-if="store.showTrustedKeysDialog" />
    <ShareKeyDialog v-if="store.showShareKeyDialog" />
    <ConfigBackupDialog v-if="store.configMode" />
    <SettingsDialog v-if="store.showSettingsDialog" />
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
  /* Distinct separator so the stacked bars don't blend into one dark mass. */
  border-bottom: 1px solid var(--border);
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
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
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
/* Logical clusters (display toggles · actions · appearance), each separated by
   a divider, so the toolbar reads as groups rather than one glued-together row. */
.group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.group.actions {
  gap: 8px;
}
.divider {
  width: 1px;
  align-self: stretch;
  margin: -8px 2px; /* bleed to the toolbar's top/bottom padding for a full line */
  background: var(--border);
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
/* Save is the primary action — accent-filled so it stands out in the group. */
.save {
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: #fff;
  font-weight: 600;
  padding: 4px 14px;
  cursor: pointer;
}
.save:hover:not(:disabled) {
  filter: brightness(1.08);
}
.save:disabled {
  opacity: 0.4;
  cursor: default;
}
/* Theme toggle: a quiet icon button, set apart from the action buttons. */
.icon-btn {
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text);
  font-size: 15px;
  line-height: 1;
  padding: 3px 8px;
  cursor: pointer;
}
.icon-btn:hover {
  border-color: var(--border);
  background: var(--bg-hover);
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
  display: flex;
  flex-direction: column;
}
.empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-dim);
}
.empty.waiting .waiting-title {
  font-size: 15px;
  color: var(--text);
}
.empty.waiting strong {
  color: var(--accent);
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
