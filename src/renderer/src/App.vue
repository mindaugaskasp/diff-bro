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
import { useSnippetStore, CLAUDE_EXAMPLE_SNIPPET } from './stores/snippetStore'
import { MOD, isMac } from './keys'

const store = useDiffStore()
const snippets = useSnippetStore()
const settings = useSettingsStore()

store.initTheme()
window.api.onMenuAction((action) => store.handleMenuAction(action))
window.api.onQuickLookOpen((payload) => store.openFromQuickLook(payload))
usePasteShortcut(() => store.requestPasteFromClipboard())
// Re-diff loaded files + roll the daily theme over when the window regains focus.
window.addEventListener('focus', () => {
  store.refreshFromDisk()
  store.resolveActiveTheme()
})

// First run only: seed the example snippet into an empty library, once.
onMounted(async () => {
  if (settings.examplesSeeded) return
  if (snippets.entries.length === 0) {
    const id = await snippets.seedExample()
    if (!id) return // vault key not ready — retry next launch
    await snippets.add({ ...CLAUDE_EXAMPLE_SNIPPET })
  }
  settings.markExamplesSeeded()
})

// Window-level file drops stand down while a dialog/paste pane handles its own.
const dropSuppressed = computed(
  () =>
    !!snippets.editingSnippet ||
    store.showBase64Dialog ||
    !!store.textTool ||
    store.showCryptDialog ||
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
    <!-- Nyan theme only. -->
    <NyanLane v-if="store.theme === 'nyan'" />
    <!-- Matrix theme only. -->
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

        <!-- Notices sit centred over the diff area (anchored to .content). -->
        <transition name="fade">
          <div v-if="store.notice" class="notice">{{ store.notice }}</div>
        </transition>

        <ShortcutBar />
      </main>
    </div>

    <AppDialogs />

    <transition name="fade">
      <div v-if="dragActive" class="drop-overlay">
        <div class="drop-card">Drop up to two files to compare</div>
      </div>
    </transition>
  </div>
</template>

<style scoped src="./components/styles/App.css"></style>
