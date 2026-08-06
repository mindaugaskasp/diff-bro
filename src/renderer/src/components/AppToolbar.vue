<script setup>
// Top bar: keys, display options, document actions. Every action has a menu twin
// (menu.js / MenuBar.vue) and a row in utils/commands.js.
//
// The bar owns almost nothing itself. The four display toggles live behind
// ViewOptionsMenu; the document actions and the overflow they fold into come
// from ToolbarOverflow, both drawing on utils/toolbarActions. That is what keeps
// this file inside its size caps and the width inside the window's minimum.
import { computed } from 'vue'
import { MOD } from '../keys'
import { useDiffStore } from '../stores/diffStore'
import { useUiStore } from '../stores/uiStore'
import { useImageExportStore } from '../features/imageExport'
import { ZOOM_DEFAULT, zoomLabel } from '../utils/diffZoom'
import KeyActions from './KeyActions.vue'
import ToolbarOverflow from './ToolbarOverflow.vue'
import ViewOptionsMenu from './ViewOptionsMenu.vue'

const store = useDiffStore()
const ui = useUiStore()
const imageExport = useImageExportStore()

// Only while the comparison is NOT at its resting size: an unzoomed diff has
// nothing to say, and a permanent "100%" would spend width the bar does not have
// to tell the reader that nothing has happened.
const zoomed = computed(() => (ui.diffZoom === ZOOM_DEFAULT ? null : zoomLabel(ui.diffZoom)))

// A plain snapshot, not the store: toolbarActions is pure, and passing it the
// store would let a row reach for anything.
const actionState = computed(() => ({
  isStreamed: store.isStreamed,
  hasUnsavedWork: store.hasUnsavedWork,
  canSave: store.canSave,
  ready: store.ready,
  comparableKind: store.comparableKind,
  isSavedDiff: store.isSavedDiff,
  canClear: store.canClear,
  isPaste: store.mode === 'paste',
  canExportImage: imageExport.canExportImage,
  isSpreadsheet: store.isSpreadsheet
}))
</script>

<template>
  <header class="toolbar band">
    <!-- Left of everything: `.options` is margin-left:auto, so this sits over
         the sidebar, beside the library these two set up. -->
    <KeyActions />
    <!-- Change counts live in the status band under the panes (DiffViewer), in
         the same words the diagram diff uses. -->
    <div class="options">
      <div class="group">
        <button
          v-if="zoomed"
          class="btn btn-sm zoom-level"
          :data-tip="$t('appToolbar.tips.resetZoom', { mod: MOD })"
          :aria-label="$t('appToolbar.resetZoom')"
          @click="ui.zoomDiff(0)"
        >
          {{ zoomed }}
        </button>
        <ViewOptionsMenu />
      </div>
      <span class="divider" />
      <ToolbarOverflow :state="actionState" />
    </div>
  </header>
</template>

<style scoped src="./styles/AppToolbar.css"></style>
