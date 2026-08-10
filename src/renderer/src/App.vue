<script setup>
import { computed, onMounted } from 'vue'
import { useDiffStore } from './stores/diffStore'
import { SnippetShot, useImageExportStore } from './features/imageExport'
import { ContinueTourDialog, TourOverlay } from './features/onboarding'
import { usePasteToCompareStore } from './features/pasteToCompare'
import { useCommands } from './composables/useCommands'
import { useSettingsStore } from './stores/settingsStore'
import { useWindowFileDrop } from './composables/useFileDrop'
import { useSnippetDiffSync } from './composables/useSnippetDiffSync'
import { usePasteShortcut } from './composables/usePasteShortcut'
import { useSessionPersistence } from './composables/useSessionPersistence'
import { useTourCommands } from './composables/useTourCommands'
import FileSlot from './components/FileSlot.vue'
import DiffViewer from './components/DiffViewer.vue'
import SpreadsheetDiffViewer from './components/SpreadsheetDiffViewer.vue'
import DiagramDiffViewer from './components/DiagramDiffViewer.vue'
import DepsDiffViewer from './components/DepsDiffViewer.vue'
import { MergeView, useMergeStore } from './features/merge'
import StructureDiffViewer from './components/StructureDiffViewer.vue'
import StreamedDiffViewer from './components/StreamedDiffViewer.vue'
import SupportedFormats from './components/SupportedFormats.vue'
import WaitingForSecond from './components/WaitingForSecond.vue'
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
import { useSnippetStore } from './stores/snippetStore'
import { useDiagramWarmup } from './composables/useDiagramWarmup'
import { MOD, isMac } from './keys'
import { useUiStore } from './stores/uiStore'
import { hasStatusBand } from './utils/viewChrome'

const store = useDiffStore()
const merge = useMergeStore()
const ui = useUiStore()
const imageExport = useImageExportStore()
const tabs = useTabsStore()
tabs.init()
const snippets = useSnippetStore()
const settings = useSettingsStore()

const showStatusBand = computed(() => hasStatusBand(store))
// One side loaded: which one is still wanted.
const missingSide = computed(() => (store.left ? 'right' : 'left'))
const { runFromMenu, runCli } = useCommands()

settings.initTheme()
window.api.onMenuAction((action) => runFromMenu(action))
window.api.onQuickLookOpen((payload) => store.openFromQuickLook(payload))
// Main holds a diffbro command until the restored session is in place (below).
window.api.onCliCommand((command) => runCli(command))
useTourCommands()
usePasteShortcut(() => usePasteToCompareStore().request())
// Writes only after the session is read back, so a blank window cannot overwrite it.
useSessionPersistence()
// Mermaid's renderer, pulled in at idle so no first render stops the app.
useDiagramWarmup()
// Re-diff + roll the daily theme over when the window regains focus.
window.addEventListener('focus', () => {
  store.refreshFromDisk()
  settings.resolveActiveTheme()
})

// Reopen last session's comparisons, then let main release any `diffbro`
// command it was holding for this window.
onMounted(async () => {
  await tabs.restoreSession()
  window.api.cliReady()
})

// First run only: seed the example snippets into an empty library, once.
onMounted(async () => {
  if (settings.examplesSeeded) return
  // Vault key not ready — retry next launch rather than record them as seeded.
  if (snippets.entries.length === 0 && !(await snippets.seedExamples())) return
  settings.markExamplesSeeded()
})

// Window-level file drops stand down while a dialog/paste pane handles its own.
const dropSuppressed = computed(
  () => !!snippets.editingSnippet || !!ui.textTool || ui.showCryptDialog || store.mode === 'paste'
)
const {
  active: dragActive,
  needsDiffRegion,
  dragKind,
  handlers: dropHandlers
} = useWindowFileDrop(store, dropSuppressed)
useSnippetDiffSync()
</script>

<template>
  <div class="app" v-on="dropHandlers">
    <MenuBar v-if="!isMac" />

    <AppToolbar />
    <!-- Nyan theme only. -->
    <NyanLane v-if="settings.theme === 'nyan'" />

    <div class="body">
      <SavedDiffs />
      <!-- The comparison column. The tab strip sits OUTSIDE .content so the
           image export, which photographs .content, still frames only the
           diff. -->
      <div class="pane" data-drop-region="diff">
        <transition name="fade">
          <div v-if="dragActive && needsDiffRegion" class="drop-overlay in-pane">
            <div class="drop-card">
              {{ dragKind === 'diff' ? $t('app.dropADiffTo') : $t('app.dropASnippetTo') }}
            </div>
          </div>
        </transition>
        <DiffTabBar />
        <!-- `capturing` hides the floating chrome that lives INSIDE the region the
           image export photographs. It is a class, not a v-if: removing the
           toast would start its fade-leave transition and the shutter would
           catch it mid-fade. -->
        <main
          class="content"
          data-tour="pane"
          :class="{ capturing: imageExport.imageCapturing, 'with-status-band': showStatusBand }"
          :style="{ '--diff-zoom': ui.diffZoom }"
        >
          <!-- Matrix theme: code rain behind the empty state / diff area, only
             while no diff is loaded (it never sits behind a comparison). -->
          <MatrixRain
            v-if="settings.theme === 'matrix' && !store.ready && store.mode !== 'paste'"
            fill
          />
          <div v-if="store.mode !== 'paste'" class="file-slots-row band band-row" data-tour="slots">
            <div class="slot-half">
              <FileSlot
                side="left"
                :file="store.left"
                :awaiting="!store.left && !!store.right"
                @pick="store.pick('left')"
              />
            </div>
            <button
              class="btn swap"
              :data-tip="$t('app.swapTip', { mod: MOD })"
              :aria-label="$t('app.swapSides')"
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

          <!-- A merge is not a comparison and does not wait for one: it takes
               the area outright, ahead of the empty state, because the file
               being produced is the point and it needs the width. -->
          <MergeView v-if="merge.open" />
          <PasteInput v-else-if="store.mode === 'paste'" />
          <!-- Content router: pick the viewer by comparable kind. -->
          <template v-else-if="store.ready">
            <template v-if="store.comparableKind === 'text'">
              <FormatHintBanner />
              <DiffViewer />
            </template>
            <DiagramDiffViewer v-else-if="store.comparableKind === 'diagram'" />
            <DepsDiffViewer v-else-if="store.comparableKind === 'deps'" />
            <StructureDiffViewer v-else-if="store.comparableKind === 'tree'" />
            <StreamedDiffViewer v-else-if="store.comparableKind === 'streamed'" />
            <SpreadsheetDiffViewer v-else />
          </template>
          <!-- One side loaded: make it obvious a second file is still needed. -->
          <WaitingForSecond
            v-else-if="store.left || store.right"
            :name="(store.left || store.right).name"
            :missing="missingSide"
            @pick="store.pick(missingSide)"
          />
          <div v-else class="empty">
            <p class="empty-title">{{ $t('app.chooseTwoFiles') }}</p>
            <SupportedFormats />
          </div>

          <!-- Notices sit centred over the diff area (anchored to .content). -->
          <transition name="fade">
            <div v-if="store.notice" class="notice">{{ store.notice }}</div>
          </transition>

          <DiskChangeNotice />

          <ShortcutBar v-if="!merge.open" />

          <!-- The photo studio: covers this column while a snippet is shot. -->
          <SnippetShot v-if="imageExport.snippetShot" :shot="imageExport.snippetShot" />
        </main>
      </div>
    </div>

    <AppDialogs />
    <AppTooltip />
    <ContinueTourDialog />
    <TourOverlay />

    <transition name="fade">
      <div v-if="dragActive && !needsDiffRegion" class="drop-overlay">
        <div class="drop-card">{{ $t('app.dropUpToTwo') }}</div>
      </div>
    </transition>
  </div>
</template>

<style scoped src="./components/styles/App.css"></style>
