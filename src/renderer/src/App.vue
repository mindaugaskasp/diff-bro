<script setup>
import { computed, onMounted } from 'vue'
import { useDiffStore } from './stores/diffStore'
import { useSettingsStore } from './stores/settingsStore'
import { useWindowFileDrop } from './composables/useFileDrop'
import { usePasteShortcut } from './composables/usePasteShortcut'
import FileSlot from './components/FileSlot.vue'
import DiffViewer from './components/DiffViewer.vue'
import SpreadsheetDiffViewer from './components/SpreadsheetDiffViewer.vue'
import SupportedFormats from './components/SupportedFormats.vue'
import NyanLane from './components/NyanLane.vue'
import MatrixRain from './components/MatrixRain.vue'
import PasteInput from './components/PasteInput.vue'
import ShortcutBar from './components/ShortcutBar.vue'
import MenuBar from './components/MenuBar.vue'
import AppDialogs from './components/AppDialogs.vue'
import AppToolbar from './components/AppToolbar.vue'
import SavedDiffs from './components/SavedDiffs.vue'
import FormatHintBanner from './components/FormatHintBanner.vue'
import { useSnippetStore } from './stores/snippetStore'
import { MOD, isMac } from './keys'

const store = useDiffStore()
const snippets = useSnippetStore()
const settings = useSettingsStore()

store.initTheme()
window.api.onMenuAction((action) => store.handleMenuAction(action))
// Ctrl/Cmd+V outside a text field offers to jump into paste mode (two-step
// confirm before the clipboard is read — see the store's paste actions).
usePasteShortcut(() => store.requestPasteFromClipboard())
// Live re-diff: whenever the window regains focus, re-read loaded files so
// external edits show up without reopening anything.
window.addEventListener('focus', () => {
  store.refreshFromDisk()
  // Roll the daily theme over if the date changed while the app sat open.
  store.resolveActiveTheme()
})

// First run: greet a brand-new, empty library with the example snippet, then
// record the one-time decision so it is never re-seeded — and never injected
// next to an existing user's own snippets.
onMounted(async () => {
  if (settings.examplesSeeded) return
  if (snippets.entries.length === 0) {
    const id = await snippets.seedExample()
    if (!id) return // vault key not ready — leave the flag unset and retry next launch
  }
  settings.markExamplesSeeded()
})

// The sidebar is a fixed width (see SavedDiffs.vue) — deliberately not
// resizable, so the layout stays predictable across sessions.

// Files dropped anywhere on the window load into the two sides; the snippet
// editor and Tools dialogs handle their own drops, so this stands down while
// one of them is open.
const dropSuppressed = computed(
  () =>
    !!snippets.editingSnippet ||
    store.showBase64Dialog ||
    !!store.textTool ||
    store.showCryptDialog ||
    // Paste mode's panes capture their own file drops (partial paste), so the
    // window-level diff drop stands down to avoid a competing overlay.
    store.mode === 'paste'
)
const {
  active: dragActive,
  onDragEnter,
  onDragLeave,
  onDrop
} = useWindowFileDrop(store, dropSuppressed)
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

    <AppToolbar />
    <!-- Nyan theme only: a slim rainbow lane where the reward cat flies on a
         match/save. Self-contained; absent in every other theme. -->
    <NyanLane v-if="store.theme === 'nyan'" />
    <!-- Matrix theme only: the digital-rain counterpart to the Nyan lane. -->
    <MatrixRain v-else-if="store.theme === 'matrix'" />

    <div class="body">
      <SavedDiffs />
      <main class="content">
        <div v-if="store.mode !== 'paste'" class="file-slots-row band band-row">
          <div class="slot-half">
            <FileSlot
              side="left"
              :file="store.left"
              :awaiting="!store.left && !!store.right"
              @pick="store.pick('left')"
            />
          </div>
          <button
            class="btn btn-ghost swap"
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
        <!-- Content router: pick the viewer by comparable kind. -->
        <template v-else-if="store.ready">
          <template v-if="store.comparableKind === 'text'">
            <FormatHintBanner />
            <DiffViewer />
          </template>
          <SpreadsheetDiffViewer v-else />
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
          <p class="empty-title">Choose or drop two files to compare.</p>
          <SupportedFormats />
        </div>

        <ShortcutBar />
      </main>
    </div>

    <AppDialogs />

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

<style scoped src="./components/styles/App.css"></style>
