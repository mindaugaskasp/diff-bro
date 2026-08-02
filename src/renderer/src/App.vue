<script setup>
import { computed, onMounted } from 'vue'
import { useDiffStore } from './stores/diffStore'
import { useSettingsStore } from './stores/settingsStore'
import { useWindowFileDrop } from './composables/useFileDrop'
import { usePasteShortcut } from './composables/usePasteShortcut'
import { useSessionPersistence } from './composables/useSessionPersistence'
import FileSlot from './components/FileSlot.vue'
import DiffViewer from './components/DiffViewer.vue'
import SpreadsheetDiffViewer from './components/SpreadsheetDiffViewer.vue'
import StructureDiffViewer from './components/StructureDiffViewer.vue'
import StreamedDiffViewer from './components/StreamedDiffViewer.vue'
import SupportedFormats from './components/SupportedFormats.vue'
import NyanLane from './components/NyanLane.vue'
import MatrixRain from './components/MatrixRain.vue'
import PasteInput from './components/PasteInput.vue'
import ShortcutBar from './components/ShortcutBar.vue'
import MenuBar from './components/MenuBar.vue'
import AppDialogs from './components/AppDialogs.vue'
import AppTooltip from './components/AppTooltip.vue'
import AppToolbar from './components/AppToolbar.vue'
import SavedDiffs from './components/SavedDiffs.vue'
import DiffTabBar from './components/DiffTabBar.vue'
import { useTabsStore } from './stores/tabsStore'
import FormatHintBanner from './components/FormatHintBanner.vue'
import AppIcon from './components/AppIcon.vue'
import DiskChangeNotice from './components/DiskChangeNotice.vue'
import { useSnippetStore, CLAUDE_EXAMPLE_SNIPPET } from './stores/snippetStore'
import { MOD, isMac } from './keys'

const store = useDiffStore()
const tabs = useTabsStore()
tabs.init()
const snippets = useSnippetStore()
const settings = useSettingsStore()

store.initTheme()
window.api.onMenuAction((action) => store.handleMenuAction(action))
window.api.onQuickLookOpen((payload) => store.openFromQuickLook(payload))
// The `diffbro` command: main holds anything that arrived before this window
// existed, and releases it only once the restored session is in place (below),
// so a comparison the user asked for is never overwritten by an old one.
window.api.onCliCommand((command) => store.runCliCommand(command))
usePasteShortcut(() => store.requestPasteFromClipboard())
// Nothing is written until the stored session has been read back (or found
// absent), so a blank startup window can never overwrite it.
useSessionPersistence()
// Re-diff loaded files + roll the daily theme over when the window regains focus.
window.addEventListener('focus', () => {
  store.refreshFromDisk()
  store.resolveActiveTheme()
})

// Reopen last session's comparisons, then let main release any `diffbro`
// command it was holding for this window.
onMounted(async () => {
  await tabs.restoreSession()
  window.api.cliReady()
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
    !!snippets.editingSnippet || !!store.textTool || store.showCryptDialog || store.mode === 'paste'
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

    <div class="body">
      <SavedDiffs />
      <!-- The comparison column. The tab strip sits OUTSIDE .content so the
           image export, which photographs .content, still frames only the
           diff. -->
      <div class="pane">
        <DiffTabBar />
        <!-- `capturing` hides the floating chrome that lives INSIDE the region the
           image export photographs. It is a class, not a v-if: removing the
           toast would start its fade-leave transition and the shutter would
           catch it mid-fade. -->
        <main class="content" :class="{ capturing: store.imageCapturing }">
          <!-- Matrix theme: code rain behind the empty state / diff area, only
             while no diff is loaded (it never sits behind a comparison). -->
          <MatrixRain
            v-if="store.theme === 'matrix' && !store.ready && store.mode !== 'paste'"
            fill
          />
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
              :data-tip="`Swap the left and right files (${MOD}+Shift+S)`"
              aria-label="Swap sides"
              :disabled="!store.ready"
              @click="store.swap"
            >
              <AppIcon name="swap" />
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
            <StructureDiffViewer v-else-if="store.comparableKind === 'tree'" />
            <StreamedDiffViewer v-else-if="store.comparableKind === 'streamed'" />
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

          <DiskChangeNotice />

          <ShortcutBar />
        </main>
      </div>
    </div>

    <AppDialogs />
    <AppTooltip />

    <transition name="fade">
      <div v-if="dragActive" class="drop-overlay">
        <div class="drop-card">Drop up to two files to compare</div>
      </div>
    </transition>
  </div>
</template>

<style scoped src="./components/styles/App.css"></style>
