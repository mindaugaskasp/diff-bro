<script setup>
// Movable Mermaid viewer (uiStore.mermaidView): zoom, drag-pan, corner-resize,
// maximize; follows OS fullscreen.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBackdropClose } from '../composables/useBackdropClose'
import { useResizable } from '../composables/useResizable'
import { useFullScreen } from '../composables/useFullScreen'
import { useZoomPan } from '../composables/useZoomPan'
import MermaidDiagram from './MermaidDiagram.vue'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'
import { DIAGRAM_THEME_OPTIONS } from '../utils/mermaid'
import { useUiStore } from '../stores/uiStore'

const ui = useUiStore()
const view = computed(() => ui.mermaidView) // { name, code, theme? }

// The theme control is a choice about the diagram in front of you, not a
// preference: it lives here and dies with the viewer. Auto unless the editor
// preview carried a ground over through Expand.
const diagramTheme = ref(view.value?.theme || 'auto')
watch(view, (v) => v && (diagramTheme.value = v.theme || 'auto'))
const isFullScreen = useFullScreen()

const DEFAULT_W = 880
const DEFAULT_H = 620
const MIN = { width: 360, height: 260 }
const CORNERS = ['nw', 'ne', 'sw', 'se']

const { rect, setCentered, beginResize } = useResizable({ min: MIN })
const { scale, tx, ty, pct, zoom, fit, onWheel, onDown, onMove, onUp } = useZoomPan()
const maxed = ref(false)

const panelStyle = computed(() => ({
  left: `${rect.left}px`,
  top: `${rect.top}px`,
  width: `${rect.width}px`,
  height: `${rect.height}px`
}))

function fitPanel() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (maxed.value) setCentered(vw * 0.96, vh * 0.92)
  else setCentered(Math.min(DEFAULT_W, vw * 0.9), Math.min(DEFAULT_H, vh * 0.82))
}
function toggleMaxed() {
  maxed.value = !maxed.value
  fitPanel()
}
// A manual drag drops the maxed flag, so the button offers to fill again.
function startResize(corner, e) {
  maxed.value = false
  beginResize(corner, e)
}

function close() {
  ui.closeMermaid()
}

// Close on a backdrop click, but not when a resize drag merely releases there.
const { onPointerDown: onBackdropDown, onClick: onBackdropClick } = useBackdropClose(close)

function onKey(e) {
  if (e.key === 'Escape') close()
}
// Keep a maximised panel filling the window as it (or the OS fullscreen) resizes.
function onWindowResize() {
  if (maxed.value) fitPanel()
}
// Only react on the way in, so leaving fullscreen doesn't shrink a grown panel.
watch(isFullScreen, (on) => {
  if (on) {
    maxed.value = true
    fitPanel()
  }
})

onMounted(() => {
  // Open maximized; the restore button shrinks it to DEFAULT_W×H.
  maxed.value = true
  fitPanel()
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onWindowResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <div v-if="view" class="viewer-backdrop" @pointerdown="onBackdropDown" @click="onBackdropClick">
    <div class="panel" :style="panelStyle">
      <div class="head">
        <span class="title">{{ view.name || 'Diagram' }}</span>
        <div class="tools">
          <button
            class="tbtn"
            :data-tip="$t('mermaidViewerDialog.zoomOut')"
            :aria-label="$t('mermaidViewerDialog.zoomOut')"
            @click="zoom(1 / 1.2)"
          >
            <AppIcon name="minus" />
          </button>
          <span class="pct" @click="fit">{{ pct }}%</span>
          <button
            class="tbtn"
            :data-tip="$t('mermaidViewerDialog.zoomIn')"
            :aria-label="$t('mermaidViewerDialog.zoomIn')"
            @click="zoom(1.2)"
          >
            <AppIcon name="plus" />
          </button>
          <button
            class="tbtn wide"
            :data-tip="$t('mermaidViewerDialog.scaleTheDiagramToFit')"
            @click="fit"
          >
            {{ $t('mermaidViewerDialog.fit') }}
          </button>
          <SegmentedControl
            compact
            :label="$t('mermaidViewerDialog.theme')"
            :value="diagramTheme"
            :options="DIAGRAM_THEME_OPTIONS"
            @update:value="diagramTheme = $event"
          />
          <button
            class="tbtn"
            :data-tip="
              maxed
                ? $t('mermaidViewerDialog.restoreThePreviousSize')
                : $t('mermaidViewerDialog.fillTheWindow')
            "
            :aria-label="
              maxed ? $t('mermaidViewerDialog.restoreSize') : $t('mermaidViewerDialog.maximize')
            "
            @click="toggleMaxed"
          >
            <AppIcon :name="maxed ? 'restore' : 'maximize'" />
          </button>
          <button
            class="tbtn close"
            :data-tip="$t('mermaidViewerDialog.closeTheViewerEsc')"
            :aria-label="$t('common.close')"
            @click="close"
          >
            <AppIcon name="x" />
          </button>
        </div>
      </div>
      <div
        class="stage"
        @wheel="onWheel"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointerleave="onUp"
      >
        <div
          class="transform"
          :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }"
        >
          <MermaidDiagram :code="view.code" :debounce="0" :theme="diagramTheme" />
        </div>
      </div>
      <div class="foot">
        <span class="hint">{{ $t('mermaidViewerDialog.dragToPanCtrlScroll') }}</span>
        <span class="resize-hint">{{ $t('mermaidViewerDialog.dragAnyCornerToResize') }}</span>
      </div>
      <span
        v-for="c in CORNERS"
        :key="c"
        class="resize-handle"
        :class="c"
        @pointerdown="startResize(c, $event)"
      />
    </div>
  </div>
</template>

<style scoped src="./styles/MermaidViewerDialog.css"></style>
